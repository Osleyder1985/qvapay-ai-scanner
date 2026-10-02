/**
 * @file arbitrage-market-history.test.ts
 * @path src/tests/arbitrage-market-history.test.ts
 * @description Pruebas deterministas del histórico de eventos y analítica por moneda.
 * @module tests
 * @status test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateCurrencyAnalytics,
  completedTradesFromEvents,
  deduplicateMarketEvents,
  normalizeMarketEvent,
  type NormalizedMarketEvent,
} from "../backend/arbitrage-market-history.js";

const NOW = new Date("2026-10-02T12:00:00.000Z");

function event(
  overrides: Partial<NormalizedMarketEvent> = {},
): NormalizedMarketEvent {
  return {
    dedupeKey: "default",
    eventId: null,
    offerUuid: "offer-1",
    event: "completed",
    status: "completed",
    side: "sell",
    coin: "BANK_CUP",
    amount: 10,
    availableAmount: 10,
    receive: 10000,
    rate: 1000,
    eventAt: "2026-10-02T11:59:00.000Z",
    observedAt: "2026-10-02T11:59:01.000Z",
    source: "stream",
    ...overrides,
  };
}

test("normaliza eventos p2p.* y conserva timestamps y source", () => {
  const result = normalizeMarketEvent(
    {
      eventId: "evt-1",
      offerUuid: "offer-1",
      event: "p2p.completed",
      status: "completed",
      type: "sell",
      coin: "bank_cup",
      amount: 10,
      receive: 10000,
      eventAt: "2026-10-02T11:00:00Z",
      observedAt: "2026-10-02T11:00:01Z",
      source: "webhook",
    },
    NOW,
  );
  assert.equal(result?.event, "completed");
  assert.equal(result?.coin, "BANK_CUP");
  assert.equal(result?.rate, 1000);
  assert.equal(result?.eventAt, "2026-10-02T11:00:00.000Z");
  assert.equal(result?.observedAt, "2026-10-02T11:00:01.000Z");
  assert.equal(result?.source, "webhook");
});

test("rechaza estados desconocidos y no infiere completed", () => {
  assert.equal(
    normalizeMarketEvent(
      {
        offerUuid: "offer-1",
        event: "deleted",
        coin: "BANK_CUP",
        source: "stream",
        eventAt: "2026-10-02T11:00:00Z",
      },
      NOW,
    ),
    null,
  );
});

test(
  "deduplica el mismo evento sin eliminar eventos distintos de la misma oferta",
  () => {
    const first = event({ dedupeKey: "same" });
    const duplicate = event({ dedupeKey: "same", source: "webhook" });
    const cancelled = event({
      dedupeKey: "cancel",
      event: "cancelled",
      status: "cancelled",
    });
    assert.equal(
      deduplicateMarketEvents([first, duplicate, cancelled]).length,
      2,
    );
  },
);

test("mantiene las monedas completamente separadas", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({ coin: "BANK_CUP", rate: 1000, receive: 10000 }),
      event({ offerUuid: "usdt-1", coin: "USDT", rate: 200, receive: 2000 }),
    ],
    "BANK_CUP",
  );
  assert.equal(result.completedCount, 1);
  assert.equal(result.vwap, 1000);
  assert.equal(result.tradedVolumeQusd, 10);
});

test("usa por defecto las últimas 100 operaciones completadas", () => {
  const events = Array.from({ length: 105 }, (_, index) =>
    event({
      offerUuid: `offer-${index}`,
      dedupeKey: `key-${index}`,
      amount: 1,
      receive: 1000 + index,
      rate: 1000 + index,
      eventAt: new Date(
        NOW.getTime() - (105 - index) * 1000,
      ).toISOString(),
    }),
  );
  const result = calculateCurrencyAnalytics(events, "BANK_CUP");
  assert.equal(result.completedCount, 100);
  assert.equal(result.minRate, 1005);
  assert.equal(result.maxRate, 1104);
});

test("calcula mediana, percentiles y VWAP", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        offerUuid: "a",
        dedupeKey: "a",
        amount: 1,
        rate: 100,
        receive: 100,
      }),
      event({
        offerUuid: "b",
        dedupeKey: "b",
        amount: 2,
        rate: 200,
        receive: 400,
      }),
      event({
        offerUuid: "c",
        dedupeKey: "c",
        amount: 1,
        rate: 300,
        receive: 300,
      }),
    ],
    "BANK_CUP",
  );
  assert.equal(result.medianRate, 200);
  assert.equal(result.vwap, 200);
  assert.equal(result.tradedVolumeQusd, 4);
  assert.equal(result.percentiles.p25, 150);
  assert.equal(result.percentiles.p75, 250);
});

test("separa completadas de canceladas", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({ offerUuid: "done", dedupeKey: "done" }),
      event({
        offerUuid: "cancelled",
        dedupeKey: "cancelled",
        event: "cancelled",
        status: "cancelled",
      }),
    ],
    "BANK_CUP",
  );
  assert.equal(result.completedCount, 1);
  assert.equal(result.cancelledCount, 1);
  assert.equal(result.completionRatePercent, 50);
  assert.equal(result.cancellationRatePercent, 50);
});

test("no cuenta una operación incompleta como ejecución", () => {
  const events = [
    event({
      offerUuid: "open",
      dedupeKey: "open",
      event: "created",
      rate: 1200,
    }),
    event({
      offerUuid: "paid",
      dedupeKey: "paid",
      event: "paid",
      rate: 1300,
    }),
  ];
  const trades = completedTradesFromEvents(events);
  assert.equal(trades.length, 0);
});

test("calcula tiempo medio hasta completar", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        offerUuid: "slow",
        dedupeKey: "created-slow",
        event: "created",
        eventAt: "2026-10-02T10:00:00Z",
      }),
      event({
        offerUuid: "slow",
        dedupeKey: "completed-slow",
        eventAt: "2026-10-02T11:00:00Z",
      }),
      event({
        offerUuid: "fast",
        dedupeKey: "created-fast",
        event: "created",
        eventAt: "2026-10-02T11:30:00Z",
      }),
      event({
        offerUuid: "fast",
        dedupeKey: "completed-fast",
        eventAt: "2026-10-02T12:00:00Z",
      }),
    ],
    "BANK_CUP",
  );
  assert.equal(result.averageTimeToCompletionMs, 60 * 60 * 1000);
});

test("marca histórico obsoleto cuando supera maxAgeMs", () => {
  const result = calculateCurrencyAnalytics(
    [event({ eventAt: "2026-10-02T10:00:00Z" })],
    "BANK_CUP",
    { now: NOW, maxAgeMs: 60_000 },
  );
  assert.equal(result.stale, true);
});
