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

test("deduplica el mismo lifecycle entre webhook y reconciliación", () => {
  const webhook = normalizeMarketEvent({
    eventId: "p2p.completed:offer-1",
    offerUuid: "offer-1",
    event: "p2p.completed",
    status: "completed",
    type: "sell",
    coin: "BANK_CUP",
    amount: 10,
    receive: 10000,
    eventAt: "2026-10-02T11:00:00Z",
    source: "webhook",
  });
  const reconciliation = normalizeMarketEvent({
    eventId: "p2p.completed:offer-1",
    offerUuid: "offer-1",
    event: "completed",
    status: "completed",
    type: "sell",
    coin: "BANK_CUP",
    amount: 10,
    receive: 10000,
    eventAt: "2026-10-02T11:01:00Z",
    source: "reconciliation",
  });
  assert.ok(webhook);
  assert.ok(reconciliation);
  assert.equal(deduplicateMarketEvents([webhook, reconciliation]).length, 1);
});

test("deduplica un completed aunque webhook y stream usen event IDs distintos", () => {
  const webhook = event({
    offerUuid: "same-offer",
    dedupeKey: "ignored-webhook-id",
    eventId: "webhook-evt-1",
  });
  const stream = event({
    offerUuid: "same-offer",
    dedupeKey: "ignored-stream-id",
    eventId: "stream-evt-9",
    source: "stream",
  });
  assert.equal(deduplicateMarketEvents([webhook, stream]).length, 1);
});

test("aplica windowSize únicamente a operaciones completadas", () => {
  const events = [
    event({
      offerUuid: "old-done",
      dedupeKey: "old-done",
      eventAt: "2026-10-01T10:00:00Z",
    }),
    event({
      offerUuid: "old-cancel",
      dedupeKey: "old-cancel",
      event: "cancelled",
      status: "cancelled",
      eventAt: "2026-10-01T11:00:00Z",
    }),
    event({
      offerUuid: "new-done",
      dedupeKey: "new-done",
      eventAt: "2026-10-02T11:00:00Z",
    }),
    event({
      offerUuid: "new-cancel",
      dedupeKey: "new-cancel",
      event: "cancelled",
      status: "cancelled",
      eventAt: "2026-10-02T11:30:00Z",
    }),
  ];
  const result = calculateCurrencyAnalytics(events, "BANK_CUP", {
    windowSize: 2,
  });
  assert.equal(result.completedCount, 2);
  assert.equal(result.cancelledCount, 0);
  assert.equal(result.terminalCount, 2);
  assert.equal(result.completionRatePercent, 100);
  assert.equal(result.cancellationRatePercent, null);
});

test("usa la creación más antigua para calcular el tiempo de finalización", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        offerUuid: "ordered",
        dedupeKey: "completed",
        eventAt: "2026-10-02T11:00:00Z",
      }),
      event({
        offerUuid: "ordered",
        dedupeKey: "created-late",
        event: "created",
        eventAt: "2026-10-02T10:30:00Z",
      }),
      event({
        offerUuid: "ordered",
        dedupeKey: "created-early",
        event: "created",
        eventAt: "2026-10-02T10:00:00Z",
      }),
    ],
    "BANK_CUP",
  );
  assert.equal(result.averageTimeToCompletionMs, 60 * 60 * 1000);
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

test("usa por defecto las últimas 500 operaciones completadas", () => {
  const events = Array.from({ length: 505 }, (_, index) =>
    event({
      offerUuid: `offer-${index}`,
      dedupeKey: `key-${index}`,
      amount: 1,
      receive: 1000 + index,
      rate: 1000 + index,
      eventAt: new Date(NOW.getTime() - (105 - index) * 1000).toISOString(),
    }),
  );
  const result = calculateCurrencyAnalytics(events, "BANK_CUP");
  assert.equal(result.completedCount, 500);
  assert.equal(result.minRate, 1005);
  assert.equal(result.maxRate, 1504);
});

test("la ventana cuenta operaciones únicas y válidas", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        offerUuid: "invalid",
        dedupeKey: "invalid",
        amount: null,
        receive: null,
        rate: null,
        eventAt: "2026-10-02T10:00:00Z",
      }),
      event({
        offerUuid: "duplicate",
        dedupeKey: "duplicate",
        eventAt: "2026-10-02T11:00:00Z",
      }),
      event({
        offerUuid: "duplicate",
        dedupeKey: "duplicate-2",
        eventAt: "2026-10-02T11:01:00Z",
      }),
      event({
        offerUuid: "valid",
        dedupeKey: "valid",
        eventAt: "2026-10-02T12:00:00Z",
      }),
    ],
    "BANK_CUP",
    { windowSize: 2 },
  );
  assert.equal(result.completedCount, 2);
  assert.equal(result.minRate, 1000);
  assert.equal(result.maxRate, 1000);
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

test("excluye canceladas de la ventana de operaciones completadas", () => {
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
  assert.equal(result.cancelledCount, 0);
  assert.equal(result.completionRatePercent, 100);
  assert.equal(result.cancellationRatePercent, null);
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
  assert.equal(result.averageTimeToCompletionMs, 45 * 60 * 1000);
});

test("mantiene unknown cuando faltan cantidad o receive", () => {
  const result = normalizeMarketEvent({
    offerUuid: "missing",
    event: "p2p.completed",
    status: "completed",
    coin: "BANK_CUP",
    source: "webhook",
    eventAt: "2026-10-02T11:00:00Z",
  });
  assert.ok(result);
  assert.equal(result.amount, null);
  assert.equal(result.receive, null);
  assert.equal(result.rate, null);
});

test("no marca como stale un evento observado en el futuro", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        eventAt: "2026-10-02T13:00:00Z",
        observedAt: "2026-10-02T13:00:00Z",
      }),
    ],
    "BANK_CUP",
    { now: NOW, maxAgeMs: 60_000 },
  );
  assert.equal(result.stale, false);
});

test("marca histórico obsoleto cuando supera maxAgeMs", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        eventAt: "2026-10-02T10:00:00Z",
        observedAt: "2026-10-02T10:00:00Z",
      }),
    ],
    "BANK_CUP",
    { now: NOW, maxAgeMs: 60_000 },
  );
  assert.equal(result.stale, true);
});
