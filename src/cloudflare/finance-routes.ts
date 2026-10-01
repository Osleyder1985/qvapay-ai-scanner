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
import {
  finiteNumber,
  parseQvaPayCollection,
  type QvaPayRecord,
} from "./qvapay-contracts.js";

type JsonResponse = (payload: unknown, status?: number) => Response;

const MAX_PAGE_SIZE = 100;
const MAX_OPERATION_PAGES = 100;

/**
 * Sincroniza operaciones completadas de QvaPay con el ledger local.
 */
export async function handleFinanceRoutes(
  request: Request,
  env: QvaPayHttpEnv & { DB: D1Database },
  url: URL,
  json: JsonResponse,
): Promise<Response | null> {
  if (request.method !== "GET" || url.pathname !== "/api/finance") return null;

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
        return json({ error: "QvaPay API error" }, upstream.status);
      }

      const collection = parseQvaPayCollection(
        payload,
        remoteEntries.length,
        MAX_PAGE_SIZE,
      );
      if (!collection) {
        return json({ error: "QvaPay API contract error." }, 502);
      }

      for (const offer of collection.data as QvaPayRecord[]) {
        const status =
          typeof offer.status === "string" ? offer.status.toLowerCase() : "";
        const type =
          typeof offer.type === "string" ? offer.type.toLowerCase() : "";
        const amount = finiteNumber(offer.amount);
        const receive = finiteNumber(offer.receive);
        const uuid =
          typeof offer.uuid === "string"
            ? offer.uuid.trim()
            : typeof offer.id === "string"
              ? offer.id.trim()
              : "";

        if (
          uuid &&
          status === "completed" &&
          (type === "buy" || type === "sell") &&
          amount !== null &&
          amount > 0 &&
          receive !== null &&
          receive >= 0
        ) {
          const createdAt =
            typeof offer.created_at === "string"
              ? offer.created_at
              : typeof offer.createdAt === "string"
                ? offer.createdAt
                : typeof offer.updated_at === "string"
                  ? offer.updated_at
                  : new Date(0).toISOString();
          const updatedAt =
            typeof offer.updated_at === "string"
              ? offer.updated_at
              : typeof offer.updatedAt === "string"
                ? offer.updatedAt
                : createdAt;

          remoteEntries.push({
            uuid,
            status: "completed",
            type: type as "buy" | "sell",
            coin: typeof offer.coin === "string" ? offer.coin : "QUSD",
            amount,
            receive,
            createdAt,
            updatedAt,
            recordedAt: new Date().toISOString(),
            grossAmountQusd: amount,
            feeQusd: null,
            netAmountQusd: null,
            feeSource: "unknown",
          });
        }
      }

      const lastPage = Math.max(
        1,
        Math.ceil(collection.total / collection.perPage),
      );
      if (page >= lastPage || collection.data.length === 0) break;
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
    return json({ error: "No se pudo sincronizar el ledger financiero" }, 503);
  }
}
