/**
 * @file cloudflare-auto-apply-executor.ts
 * @path src/backend/cloudflare/cloudflare-auto-apply-executor.ts
 * @description Ejecución única de Auto-Apply protegida mediante lease para Cloudflare.
 * @module backend/cloudflare
 * @status migration
 */

import { isVipOnlyOffer } from "../auto-apply.js";
import {
  createAutoApplyExecutor,
  type AutoApplyExecutionResult,
  type AutoApplyExecutor,
} from "../auto-apply-executor.js";
import type {
  D1AutoApplyConfigRow,
  D1AutoApplyStateRow,
  D1Repository,
} from "./d1-repository.js";
import type { QvaPayClient, QvaPayHttpResult } from "./qvapay-client.js";

interface MarketOffer {
  uuid?: unknown;
  id?: unknown;
  status?: unknown;
  type?: unknown;
  coin?: unknown;
  amount?: unknown;
  receive?: unknown;
  only_vip?: unknown;
}

interface CloudflareAutoApplyDependencies {
  repository: Pick<
    D1Repository,
    | "getAutoApplyConfig"
    | "getAutoApplyState"
    | "hasAppliedOffer"
    | "updateAutoApplyState"
    | "claimAutoApplyExecutionLease"
    | "releaseAutoApplyExecutionLease"
    | "recordAutoApplyAttempt"
    | "recordAppliedOffer"
    | "recordVipRejection"
  >;
  qvapay: Pick<QvaPayClient, "getP2P" | "getOwnP2P" | "applyP2POffer">;
  now?: () => Date;
  ownerId?: () => string;
}

const LEASE_MS = 90_000;
const VIP_COOLDOWN_MS = 5 * 60_000;

function today(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function payloadData(result: QvaPayHttpResult): unknown[] {
  const payload = result.payload;
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as Record<string, unknown>).data;
  return Array.isArray(data) ? data : [];
}

function responseDetail(result: QvaPayHttpResult): string {
  if (result.payload === null) return "";
  return typeof result.payload === "string"
    ? result.payload
    : JSON.stringify(result.payload);
}

function matches(
  offer: MarketOffer,
  config: D1AutoApplyConfigRow,
  dailyAppliedQusd: number,
): boolean {
  const status = String(offer.status ?? "open").toLowerCase();
  const type = String(offer.type ?? "").toLowerCase();
  const coin = String(offer.coin ?? "").toUpperCase();
  const amount = Number(offer.amount);
  const receive = Number(offer.receive);
  const rate = amount > 0 ? receive / amount : NaN;

  if (status !== "open" || type !== config.type) return false;
  if (isVipOnlyOffer(offer as Record<string, unknown>)) return false;
  if (config.coin && coin !== config.coin.toUpperCase()) return false;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate)) {
    return false;
  }
  if (config.rate_min !== null && rate < config.rate_min) return false;
  if (config.rate_max !== null && rate > config.rate_max) return false;
  if (config.amount_min !== null && amount < config.amount_min) return false;
  if (config.amount_max !== null && amount > config.amount_max) return false;
  if (
    config.daily_max_qusd !== null &&
    dailyAppliedQusd + amount > config.daily_max_qusd
  ) {
    return false;
  }
  return true;
}

function offerUuid(offer: MarketOffer): string {
  return String(offer.uuid ?? offer.id ?? "").trim();
}

/**
 * Crea el executor de Auto-Apply de Cloudflare. Realiza exactamente un
 * ciclo de escaneo/acción durable y no posee temporizador ni scheduler.
 */
export function createCloudflareAutoApplyExecutor(
  dependencies: CloudflareAutoApplyDependencies,
): AutoApplyExecutor {
  const now = dependencies.now ?? (() => new Date());
  const ownerId =
    dependencies.ownerId ?? (() => `auto-apply-${crypto.randomUUID()}`);

  return createAutoApplyExecutor(
    async (): Promise<
      Omit<AutoApplyExecutionResult, "startedAt" | "finishedAt">
    > => {
      const started = now();
      const startedAt = started.toISOString();
      const config = await dependencies.repository.getAutoApplyConfig();

      if (!config) {
        return {
          status: "disabled",
          message: "Auto-Apply configuration is absent.",
        };
      }
      if (config.enabled !== 1) {
        return { status: "disabled", message: "Auto-Apply is disabled." };
      }

      const state =
        (await dependencies.repository.getAutoApplyState()) ??
        ({
          id: 1,
          daily_date: today(started),
          daily_applied_qusd: 0,
          last_scan_at: null,
          last_action_at: null,
          last_message: "",
          updated_at: startedAt,
        } satisfies D1AutoApplyStateRow);

      const runId = ownerId();
      const expiresAt = new Date(started.getTime() + LEASE_MS).toISOString();
      const claimed =
        await dependencies.repository.claimAutoApplyExecutionLease({
          ownerId: runId,
          acquiredAt: startedAt,
          expiresAt,
          now: startedAt,
        });

      if (!claimed) {
        return {
          status: "skipped",
          message: "Another Auto-Apply execution owns the lease.",
        };
      }

      let lastActionAt = state.last_action_at;
      let dailyDate = state.daily_date;
      let dailyAppliedQusd = state.daily_applied_qusd;

      try {
        if (dailyDate !== today(started)) {
          dailyDate = today(started);
          dailyAppliedQusd = 0;
          lastActionAt = null;
        }

        const own = await dependencies.qvapay.getOwnP2P("processing");
        if (!own.ok) {
          const message = `Unable to read own processing operations: HTTP ${own.status}`;
          await dependencies.repository.updateAutoApplyState({
            dailyDate,
            dailyAppliedQusd,
            lastScanAt: startedAt,
            lastActionAt,
            lastMessage: message,
            updatedAt: now().toISOString(),
          });
          return { status: "failed", message };
        }

        const processingCount = payloadData(own).length;
        if (processingCount >= config.max_concurrent) {
          const message = `Paused by concurrent-operation limit (${processingCount}/${config.max_concurrent}).`;
          await dependencies.repository.updateAutoApplyState({
            dailyDate,
            dailyAppliedQusd,
            lastScanAt: startedAt,
            lastActionAt,
            lastMessage: message,
            updatedAt: now().toISOString(),
          });
          return { status: "skipped", message };
        }

        const query = new URLSearchParams({
          page: "1",
          take: "100",
          type: config.type,
          orderBy: "updated_at",
          orderType: "desc",
        });
        if (config.coin) query.set("coin", config.coin);

        const market = await dependencies.qvapay.getP2P(query);
        if (!market.ok) {
          const message = `Unable to read market: HTTP ${market.status}`;
          await dependencies.repository.updateAutoApplyState({
            dailyDate,
            dailyAppliedQusd,
            lastScanAt: startedAt,
            lastActionAt,
            lastMessage: message,
            updatedAt: now().toISOString(),
          });
          return { status: "failed", message };
        }

        const candidates = (payloadData(market) as MarketOffer[])
          .filter(
            (offer) =>
              offerUuid(offer) && matches(offer, config, dailyAppliedQusd),
          )
          .sort(
            (a, b) =>
              Number(a.receive) / Number(a.amount) -
              Number(b.receive) / Number(b.amount),
          );

        for (const offer of candidates) {
          const uuid = offerUuid(offer);
          if (await dependencies.repository.hasAppliedOffer(uuid)) continue;

          const amount = Number(offer.amount);
          const attemptedAt = now().toISOString();
          const response = await dependencies.qvapay.applyP2POffer(uuid);
          const detail = responseDetail(response);

          await dependencies.repository.recordAutoApplyAttempt({
            offerUuid: uuid,
            attemptedAt,
            httpStatus: response.status,
            success: response.ok,
            amountQusd: Number.isFinite(amount) ? amount : null,
            responseJson: detail || null,
            reason: response.ok ? "applied" : `HTTP ${response.status}`,
          });

          if (response.ok) {
            await dependencies.repository.recordAppliedOffer(
              uuid,
              attemptedAt,
              amount,
            );
            dailyAppliedQusd += amount;
            lastActionAt = attemptedAt;
            const message = `Offer ${uuid} accepted automatically (${amount} QUSD).`;
            await dependencies.repository.updateAutoApplyState({
              dailyDate,
              dailyAppliedQusd,
              lastScanAt: startedAt,
              lastActionAt,
              lastMessage: message,
              updatedAt: now().toISOString(),
            });
            return { status: "completed", message };
          }

          if (response.status === 400 && detail.toLowerCase().includes("vip")) {
            const expiresAt = new Date(
              now().getTime() + VIP_COOLDOWN_MS,
            ).toISOString();
            await dependencies.repository.recordVipRejection({
              offerUuid: uuid,
              rejectedAt: attemptedAt,
              expiresAt,
              reason: detail || "QvaPay requires VIP.",
            });
          }

          const message =
            `QvaPay rejected automatic application of ${uuid}: HTTP ${response.status} ${detail}`.trim();
          await dependencies.repository.updateAutoApplyState({
            dailyDate,
            dailyAppliedQusd,
            lastScanAt: startedAt,
            lastActionAt,
            lastMessage: message,
            updatedAt: now().toISOString(),
          });

          if (response.status === 429) {
            return { status: "skipped", message };
          }
        }

        const message = "Scan completed: no eligible unapplied offer found.";
        await dependencies.repository.updateAutoApplyState({
          dailyDate,
          dailyAppliedQusd,
          lastScanAt: startedAt,
          lastActionAt,
          lastMessage: message,
          updatedAt: now().toISOString(),
        });
        return { status: "completed", message };
      } finally {
        await dependencies.repository.releaseAutoApplyExecutionLease(
          runId,
          now().toISOString(),
        );
      }
    },
  );
}
