/**
 * @file arbitrage-history-routes.ts
 * @path src/cloudflare/arbitrage-history-routes.ts
 * @description Expone la analítica histórica de mercado por moneda.
 * @module cloudflare
 * @status active
 */

import {
  listFinanceEntries,
  listMarketEvents,
  listMarketEventsForAnalytics,
  listOperations,
  queryMarketHistory,
  type D1Database,
  type MarketEventRow,
} from "./d1.js";
import {
  calculateCurrencyAnalytics,
  reconcileMarketEventLifecycle,
  type NormalizedMarketEvent,
} from "../backend/arbitrage-market-history.js";
import { reconcileArbitrageHistory } from "./arbitrage-event-ingestion.js";
import type { QvaPayHttpEnv } from "./qvapay-http.js";
import { reconcileLayerState } from "../backend/reconciliation.js";

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
    sourceEventAt: row.source_event_at,
    sourceObservedAt: row.source_observed_at,
    timestampQuality:
      row.timestamp_quality as NormalizedMarketEvent["timestampQuality"],
    quarantined: row.quarantined === 1,
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

  if (
    request.method === "GET" &&
    url.pathname === "/api/arbitrage/reconciliation"
  ) {
    const coin =
      url.searchParams.get("coin")?.trim().toUpperCase() || undefined;
    const [eventRows, operations, finance, marketHistory] = await Promise.all([
      listMarketEvents(env.DB, coin, 10000),
      listOperations(env.DB),
      listFinanceEntries(env.DB),
      queryMarketHistory(env.DB, coin, undefined, 1000),
    ]);
    const events = eventRows.map(toEvent);
    const report = reconcileLayerState({
      events,
      operations: coin
        ? operations.filter(
            (operation) =>
              String(operation.payload.coin ?? "")
                .trim()
                .toUpperCase() === coin,
          )
        : operations,
      finance: coin
        ? finance.filter((entry) => entry.coin.toUpperCase() === coin)
        : finance,
      marketHistory,
    });
    return json(report, 200);
  }

  if (request.method !== "GET") return null;
  if (url.pathname !== "/api/arbitrage/history") return null;

  const coin = url.searchParams.get("coin")?.trim().toUpperCase() ?? "";
  if (!coin) return json({ error: "coin es obligatorio." }, 400);

  const rawWindow = url.searchParams.get("window");
  const windowSize = rawWindow === null ? 500 : Number(rawWindow);
  if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize > 1000) {
    return json(
      { error: "window debe ser un entero positivo entre 1 y 1000." },
      400,
    );
  }

  const rows = await listMarketEventsForAnalytics(env.DB, coin, windowSize);
  const events = rows.map(toEvent);
  const lifecycle = reconcileMarketEventLifecycle(events);
  const analytics = calculateCurrencyAnalytics(events, coin, {
    windowSize,
  });

  return json({
    coin,
    analytics,
    eventCount: rows.length,
    lifecycle: {
      invalidTransitionCount: lifecycle.violations.length,
      invalidTransitions: lifecycle.violations,
      quarantinedEventCount: lifecycle.quarantinedEvents.length,
    },
  });
}
