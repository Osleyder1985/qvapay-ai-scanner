/**
 * @file finance-routes.ts
 * @path src/cloudflare/finance-routes.ts
 * @description Ruta de sincronización y consulta del ledger financiero.
 * @module cloudflare
 * @status active
 */

import {
  listFinanceEntries,
  upsertFinanceEntries,
  type FinanceLedgerEntry,
  type D1Database,
} from "./d1.js";
import { calculateFinanceSummary } from "../backend/finance.js";
import {
  qvapay,
  readQvaPayPayload,
  type QvaPayHttpEnv,
} from "./qvapay-http.js";

type JsonRecord = Record<string, unknown>;
type JsonResponse = (payload: unknown, status?: number) => Response;

const MAX_PAGE_SIZE = 100;
const MAX_OPERATION_PAGES = 100;

function records(payload: unknown): JsonRecord[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as JsonRecord).data;
  return Array.isArray(data)
    ? data.filter(
        (value): value is JsonRecord =>
          Boolean(value) && typeof value === "object",
      )
    : [];
}

function pagination(
  payload: unknown,
  fallback: number,
): { total: number; perPage: number } {
  if (!payload || typeof payload !== "object") {
    return { total: fallback, perPage: MAX_PAGE_SIZE };
  }
  const record = payload as JsonRecord;
  const total = Number(record.total ?? fallback);
  const perPage = Number(record.per_page ?? MAX_PAGE_SIZE);
  return {
    total: Number.isFinite(total) ? total : fallback,
    perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : MAX_PAGE_SIZE,
  };
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

/**
 * Sincroniza operaciones completadas de QvaPay con el ledger local.
 */
export async function handleFinanceRoutes(
  request: Request,
  env: QvaPayHttpEnv & { DB: D1Database },
  url: URL,
  json: JsonResponse,
): Promise<Response | null> {
  if (request.method !== "GET" || url.pathname !== "/api/finance") {
    return null;
  }

  try {
    const remoteEntries: FinanceLedgerEntry[] = [];

    for (let page = 1; page <= MAX_OPERATION_PAGES; page += 1) {
      const pageUrl = new URL(url);
      pageUrl.search = "";
      pageUrl.searchParams.set("my", "1");
      pageUrl.searchParams.set("status", "completed");
      pageUrl.searchParams.set("take", String(MAX_PAGE_SIZE));
      pageUrl.searchParams.set("page", String(page));
      pageUrl.searchParams.set("orderBy", "updated_at");
      pageUrl.searchParams.set("orderType", "asc");

      const upstream = await qvapay(env, "/p2p?" + pageUrl.searchParams);
      const payload = await readQvaPayPayload(upstream);

      if (!upstream.ok) {
        return json(
          { error: "QvaPay API error", detail: payload },
          upstream.status,
        );
      }

      const pageRecords = records(payload);
      for (const offer of pageRecords) {
        const status = String(offer.status ?? "").toLowerCase();
        const type = String(offer.type ?? "").toLowerCase();
        const amount = numberValue(offer.amount);
        const receive = numberValue(offer.receive);
        const uuid = String(offer.uuid ?? offer.id ?? "").trim();

        if (
          uuid &&
          status === "completed" &&
          (type === "buy" || type === "sell") &&
          Number.isFinite(amount) &&
          amount > 0 &&
          Number.isFinite(receive) &&
          receive >= 0
        ) {
          const createdAt = String(
            offer.created_at ??
              offer.createdAt ??
              offer.updated_at ??
              new Date(0).toISOString(),
          );
          remoteEntries.push({
            uuid,
            status: "completed",
            type: type as "buy" | "sell",
            coin: String(offer.coin ?? "QUSD"),
            amount,
            receive,
            createdAt,
            updatedAt: String(offer.updated_at ?? offer.updatedAt ?? createdAt),
            recordedAt: new Date().toISOString(),
            grossAmountQusd: amount,
            feeQusd: null,
            netAmountQusd: null,
            feeSource: "unknown",
          });
        }
      }

      const meta = pagination(payload, remoteEntries.length);
      const lastPage = Math.max(1, Math.ceil(meta.total / meta.perPage));
      if (page >= lastPage || !pageRecords.length) break;
    }

    await upsertFinanceEntries(env.DB, remoteEntries);
    const ledger = await listFinanceEntries(env.DB);
    const knownFees = ledger.filter(
      (entry) => entry.feeSource === "qvapay_received",
    );
    const feeQusd = knownFees.reduce(
      (sum, entry) => sum + (entry.feeQusd ?? 0),
      0,
    );

    return json({
      finance: calculateFinanceSummary(ledger),
      fees: {
        knownQusd: feeQusd,
        knownOperations: knownFees.length,
        unknownOperations: ledger.length - knownFees.length,
      },
      source: {
        status: "completed",
        fetched: remoteEntries.length,
        persisted: ledger.length,
      },
    });
  } catch {
    return json(
      { error: "No se pudo sincronizar el ledger financiero" },
      503,
    );
  }
}
