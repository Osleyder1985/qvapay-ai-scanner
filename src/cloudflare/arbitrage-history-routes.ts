/**
 * @file arbitrage-history-routes.ts
 * @path src/cloudflare/arbitrage-history-routes.ts
 * @description Expone la analítica histórica de mercado por moneda.
 * @module cloudflare
 * @status active
 */

import {
  listMarketEventsForAnalytics,
  type D1Database,
  type MarketEventRow,
} from "./d1.js";
import {
  calculateCurrencyAnalytics,
  type NormalizedMarketEvent,
} from "../backend/arbitrage-market-history.js";
import { reconcileArbitrageHistory } from "./arbitrage-event-ingestion.js";
import type { QvaPayHttpEnv } from "./qvapay-http.js";

interface RouteEnv extends QvaPayHttpEnv {
  DB: D1Database;
}

interface Json {
  (payload: unknown, status?: number): Response;
}

function toEvent(row: MarketEventRow): NormalizedMarketEvent {
  return {
    dedupeKey: row.dedupe_key,
    eventId: row.event_id,
    offerUuid: row.offer_uuid,
    event: row.event as NormalizedMarketEvent["event"],
    status: row.status,
    side: row.side,
    coin: row.coin,
    amount: row.amount,
    availableAmount: row.available_amount,
    receive: row.receive,
    rate: row.rate,
    eventAt: row.event_at,
    observedAt: row.observed_at,
    source: row.source as NormalizedMarketEvent["source"],
  };
}

export async function handleArbitrageHistoryRoutes(
  request: Request,
  env: RouteEnv,
  url: URL,
  json: Json,
): Promise<Response | null> {
  if (
    request.method === "POST" &&
    url.pathname === "/api/arbitrage/reconcile"
  ) {
    const result = await reconcileArbitrageHistory(env);
    return json(result, 200);
  }

  if (request.method !== "GET") return null;
  if (url.pathname !== "/api/arbitrage/history") return null;

  const coin = url.searchParams.get("coin")?.trim().toUpperCase() ?? "";
  if (!coin) return json({ error: "coin es obligatorio." }, 400);

  const windowSize = Math.min(
    Math.max(Number(url.searchParams.get("window") ?? "500"), 1),
    1000,
  );
  if (!Number.isInteger(windowSize)) {
    return json({ error: "window debe ser un entero positivo." }, 400);
  }

  const rows = await listMarketEventsForAnalytics(env.DB, coin, windowSize);
  const analytics = calculateCurrencyAnalytics(rows.map(toEvent), coin, {
    windowSize,
  });

  return json({
    coin,
    analytics,
    eventCount: rows.length,
  });
}
