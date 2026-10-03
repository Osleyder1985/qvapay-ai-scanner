/**
 * @file arbitrage-monitor-routes.ts
 * @path src/cloudflare/arbitrage-monitor-routes.ts
 * @description API de estado y control del monitor server-side de arbitraje.
 * @module cloudflare
 * @status active
 */

import {
  ensureArbitrageExecutionConfigColumns,
  monitorState,
  runArbitrageMonitor,
  type ArbitrageMonitorEnv,
} from "./arbitrage-monitor.js";
import type { D1Database } from "./d1.js";
import {
  logInternalError,
  publicError,
  type PublicErrorCode,
} from "./error-contract.js";

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}

interface Env extends ArbitrageMonitorEnv {
  ARBITRAGE_MONITOR: DurableObjectNamespaceLike;
}

type Json = (payload: unknown, status?: number) => Response;

const MONITOR_ERROR_CODES = new Set<PublicErrorCode>([
  "MONITOR_RUN_FAILED",
  "MONITOR_STATE_READ_FAILED",
  "MONITOR_CONFIG_ROW_MISSING",
  "MONITOR_CONFIG_WRITE_FAILED",
]);

function sanitizeMonitorError(value: unknown): PublicErrorCode | null {
  const code = typeof value === "string" ? value : "";
  return MONITOR_ERROR_CODES.has(code as PublicErrorCode)
    ? (code as PublicErrorCode)
    : value
      ? "MONITOR_RUN_FAILED"
      : null;
}

function stub(env: Env) {
  const id = env.ARBITRAGE_MONITOR.idFromName("global");
  return env.ARBITRAGE_MONITOR.get(id);
}

async function ensureMonitorProgress(env: Env) {
  const current = await monitorState(env.DB);
  const alarmResponse = await stub(env).fetch(
    new Request("https://internal/status"),
  );
  if (alarmResponse.ok) {
    const alarmPayload = (await alarmResponse.json()) as { alarm?: unknown };
    if (typeof alarmPayload.alarm === "number") return current;
  }

  const nextRunAt = current.state?.next_run_at
    ? Date.parse(current.state.next_run_at)
    : Number.NaN;
  const intervalMs = current.config.intervalSeconds * 1000;
  if (
    Number.isFinite(nextRunAt) &&
    nextRunAt > Date.now() &&
    nextRunAt <= Date.now() + intervalMs
  ) {
    return current;
  }

  await runArbitrageMonitor(env.DB, env);
  return monitorState(env.DB);
}

function operationalError(
  code:
    | "MONITOR_STATE_READ_FAILED"
    | "MONITOR_CONFIG_ROW_MISSING"
    | "MONITOR_CONFIG_WRITE_FAILED",
  json: Json,
): Response {
  logInternalError("arbitrage_monitor.operation_failed", code);
  return json(publicError(code), 503);
}

export async function handleArbitrageMonitorRoutes(
  request: Request,
  env: Env,
  url: URL,
  json: Json,
): Promise<Response | null> {
  if (url.pathname !== "/api/arbitrage/monitor") return null;

  if (request.method === "GET") {
    try {
      const current = await ensureMonitorProgress(env);
      try {
        await stub(env).fetch(new Request("https://internal/start"));
      } catch {
        // Keep the state endpoint readable even if the Durable Object is temporarily unavailable.
      }
      let payload: Record<string, unknown> = {};
      if (current.state?.payload_json) {
        try {
          payload = JSON.parse(current.state.payload_json) as Record<
            string,
            unknown
          >;
        } catch {
          payload = {};
        }
      }
      return json({
        mode: "read-only",
        executionEnabled: false,
        config: current.config,
        state: {
          status: current.state?.status ?? "starting",
          scanId: current.state?.scan_id ?? null,
          scannedAt: current.state?.scanned_at ?? null,
          nextRunAt: current.state?.next_run_at ?? null,
          lastSuccessAt: current.state?.last_success_at ?? null,
          lastError: sanitizeMonitorError(current.state?.last_error),
          updatedAt: current.state?.updated_at ?? null,
        },
        marketOffers: payload.marketOffers ?? [],
        opportunities: payload.opportunities ?? [],
        marketSimulation: payload.marketSimulation ?? null,
        coverage: payload.coverage ?? null,
      });
    } catch (error) {
      return operationalError("MONITOR_STATE_READ_FAILED", json);
    }
  }

  if (request.method !== "POST") return null;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const margin = Number(body.minMarginPercent ?? 5);
    const intervalSeconds = Number(body.intervalSeconds ?? 10);
    const autoEnabled = Boolean(body.autoEnabled ?? false);
    const maxBuyRate =
      body.maxBuyRate == null || body.maxBuyRate === ""
        ? null
        : Number(body.maxBuyRate);
    const minSellRate =
      body.minSellRate == null || body.minSellRate === ""
        ? null
        : Number(body.minSellRate);
    const cupBudget = Number(body.cupBudget ?? 0);
    const coin = String(body.coin ?? "BANK_CUP")
      .trim()
      .toUpperCase();
    if (!Number.isFinite(margin) || margin < 0)
      return json({ error: "minMarginPercent inválido." }, 400);
    if (
      typeof body.autoEnabled !== "undefined" &&
      typeof body.autoEnabled !== "boolean"
    )
      return json({ error: "autoEnabled inválido." }, 400);
    if (
      maxBuyRate !== null &&
      (!Number.isFinite(maxBuyRate) || maxBuyRate <= 0)
    )
      return json(
        { error: "maxBuyRate debe ser mayor que 0 o estar vacío." },
        400,
      );
    if (
      minSellRate !== null &&
      (!Number.isFinite(minSellRate) || minSellRate <= 0)
    )
      return json(
        { error: "minSellRate debe ser mayor que 0 o estar vacío." },
        400,
      );
    if (!Number.isFinite(cupBudget) || cupBudget < 0)
      return json({ error: "cupBudget debe ser un número no negativo." }, 400);
    if (
      !Number.isInteger(intervalSeconds) ||
      intervalSeconds < 5 ||
      intervalSeconds > 300
    )
      return json(
        { error: "intervalSeconds debe estar entre 5 y 300 segundos." },
        400,
      );
    if (!/^[A-Z0-9_]{2,32}$/.test(coin))
      return json({ error: "coin inválida." }, 400);

    await ensureArbitrageExecutionConfigColumns(env.DB);
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      `UPDATE arbitrage_monitor_config
       SET min_margin_percent = ?, coin = ?, interval_seconds = ?,
           auto_enabled = ?, max_buy_rate = ?, min_sell_rate = ?,
           cup_budget = ?, enabled = 1, updated_at = ?
       WHERE id = 1`,
    )
      .bind(
        margin,
        coin,
        intervalSeconds,
        autoEnabled ? 1 : 0,
        maxBuyRate,
        minSellRate,
        cupBudget,
        now,
      )
      .run();

    if (Number(result.meta?.changes ?? 0) !== 1) {
      return operationalError("MONITOR_CONFIG_ROW_MISSING", json);
    }

    await stub(env).fetch(new Request("https://internal/start"));
    return json({
      ok: true,
      minMarginPercent: margin,
      coin,
      intervalSeconds,
      autoEnabled,
      maxBuyRate,
      minSellRate,
      cupBudget,
      nextRunAt: new Date(Date.now() + intervalSeconds * 1000).toISOString(),
    });
  } catch (error) {
    return operationalError("MONITOR_CONFIG_WRITE_FAILED", json);
  }
}

export async function bootstrapArbitrageMonitor(env: Env): Promise<void> {
  await stub(env).fetch(new Request("https://internal/start"));
}
