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
  reconcileMarketEventLifecycle,
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
    sourceEventAt: "2026-10-02T11:59:00Z",
    sourceObservedAt: "2026-10-02T11:59:01Z",
    timestampQuality: "valid",
    quarantined: false,
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

test("prefiere una observación válida frente a una futura en cuarentena", () => {
  const quarantined = event({
    offerUuid: "clock-skew",
    observedAt: "2026-10-02T12:05:00Z",
    eventAt: "2026-10-02T12:15:00Z",
    timestampQuality: "future_skew",
    quarantined: true,
  });
  const valid = event({
    offerUuid: "clock-skew",
    observedAt: "2026-10-02T12:01:00Z",
    eventAt: "2026-10-02T12:00:00Z",
    timestampQuality: "valid",
    quarantined: false,
  });

  const result = deduplicateMarketEvents([quarantined, valid]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.quarantined, false);
  assert.equal(result[0]?.eventAt, "2026-10-02T12:00:00Z");
});

test("conserva el payload completado de la observación más reciente", () => {
  const older = event({
    offerUuid: "canonical",
    observedAt: "2026-10-02T11:00:01Z",
    amount: 10,
    receive: 10000,
    rate: 1000,
    source: "stream",
  });
  const newer = event({
    offerUuid: "canonical",
    observedAt: "2026-10-02T11:05:01Z",
    amount: 10,
    receive: 10500,
    rate: 1050,
    source: "reconciliation",
  });

  const result = deduplicateMarketEvents([newer, older]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.rate, 1050);
  assert.equal(result[0]?.receive, 10500);
});

test("conserva la creación más antigua aunque llegue después otra observación", () => {
  const later = event({
    offerUuid: "created-canonical",
    event: "created",
    status: "open",
    eventAt: "2026-10-02T11:00:00Z",
    observedAt: "2026-10-02T11:00:01Z",
  });
  const earlier = event({
    offerUuid: "created-canonical",
    event: "created",
    status: "open",
    eventAt: "2026-10-02T10:00:00Z",
    observedAt: "2026-10-02T11:05:01Z",
  });

  const result = deduplicateMarketEvents([later, earlier]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.eventAt, "2026-10-02T10:00:00Z");
});

test("reordena eventos fuera de orden por eventAt de forma determinista", () => {
  const created = event({
    offerUuid: "ordered",
    event: "created",
    status: "open",
    eventAt: "2026-10-02T10:00:00Z",
    observedAt: "2026-10-02T12:03:00Z",
  });
  const applied = event({
    offerUuid: "ordered",
    event: "applied",
    status: "processing",
    eventAt: "2026-10-02T11:00:00Z",
    observedAt: "2026-10-02T12:02:00Z",
  });
  const completed = event({
    offerUuid: "ordered",
    event: "completed",
    eventAt: "2026-10-02T12:00:00Z",
    observedAt: "2026-10-02T12:01:00Z",
  });

  const result = reconcileMarketEventLifecycle([completed, created, applied]);
  assert.deepEqual(
    result.events.map((item) => item.event),
    ["created", "applied", "completed"],
  );
  assert.equal(result.violations.length, 0);
});

test("rechaza regresiones de ciclo después de un estado terminal", () => {
  const result = reconcileMarketEventLifecycle([
    event({
      offerUuid: "regression",
      event: "created",
      status: "open",
      eventAt: "2026-10-02T10:00:00Z",
    }),
    event({
      offerUuid: "regression",
      event: "completed",
      eventAt: "2026-10-02T11:00:00Z",
    }),
    event({
      offerUuid: "regression",
      event: "paid",
      status: "paid",
      eventAt: "2026-10-02T12:00:00Z",
    }),
  ]);

  assert.deepEqual(
    result.events.map((item) => item.event),
    ["created", "completed"],
  );
  assert.deepEqual(result.violations[0], {
    offerUuid: "regression",
    previousEvent: "completed",
    event: "paid",
    previousEventAt: "2026-10-02T11:00:00Z",
    eventAt: "2026-10-02T12:00:00Z",
    reason: "invalid_transition",
  });
});

test("permite reabrir una oferta cancelada pero no completar directamente una cancelada", () => {
  const result = reconcileMarketEventLifecycle([
    event({
      offerUuid: "reopened",
      event: "created",
      status: "open",
      eventAt: "2026-10-02T10:00:00Z",
    }),
    event({
      offerUuid: "reopened",
      event: "cancelled",
      status: "cancelled",
      eventAt: "2026-10-02T11:00:00Z",
    }),
    event({
      offerUuid: "reopened",
      event: "reopened",
      status: "open",
      eventAt: "2026-10-02T12:00:00Z",
    }),
    event({
      offerUuid: "reopened",
      event: "completed",
      eventAt: "2026-10-02T13:00:00Z",
    }),
  ]);

  assert.deepEqual(
    result.events.map((item) => item.event),
    ["created", "cancelled", "reopened", "completed"],
  );
  assert.equal(result.violations.length, 0);
});

test("marca completion posterior a completed como violación y conserva el evento original", () => {
  const result = reconcileMarketEventLifecycle([
    event({
      offerUuid: "terminal",
      event: "created",
      status: "open",
      eventAt: "2026-10-02T10:00:00Z",
    }),
    event({
      offerUuid: "terminal",
      event: "completed",
      eventAt: "2026-10-02T11:00:00Z",
    }),
    event({
      offerUuid: "terminal",
      event: "completed",
      dedupeKey: "terminal|completed-newer",
      observedAt: "2026-10-02T12:00:00Z",
      eventAt: "2026-10-02T12:00:00Z",
    }),
  ]);

  assert.equal(
    result.events.filter((item) => item.event === "completed").length,
    1,
  );
  assert.equal(result.violations.length, 0);
});

test("deduplica un completed aunque webhook y stream usen event IDs distintos", () => {
  const webhook = event({
    offerUuid: "same-offer",
    dedupeKey: "same-offer|completed",
    eventId: "webhook-evt-1",
  });
  const stream = event({
    offerUuid: "same-offer",
    dedupeKey: "same-offer|completed",
    eventId: "stream-evt-9",
    source: "stream",
  });
  assert.equal(deduplicateMarketEvents([webhook, stream]).length, 1);
});

test("aplica windowSize a la ventana terminal", () => {
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
  assert.equal(result.completedCount, 1);
  assert.equal(result.cancelledCount, 1);
  assert.equal(result.terminalCount, 2);
  assert.equal(result.completionRatePercent, 50);
  assert.equal(result.cancellationRatePercent, 50);
});

test("incluye cancelaciones en la ventana terminal y calcula tasas reales", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        offerUuid: "completed",
        dedupeKey: "completed",
        eventAt: "2026-10-02T11:00:00Z",
      }),
      event({
        offerUuid: "cancelled",
        dedupeKey: "cancelled",
        event: "cancelled",
        status: "cancelled",
        eventAt: "2026-10-02T11:30:00Z",
      }),
    ],
    "BANK_CUP",
    { windowSize: 2 },
  );
  assert.equal(result.completedCount, 1);
  assert.equal(result.cancelledCount, 1);
  assert.equal(result.terminalCount, 2);
  assert.equal(result.completionRatePercent, 50);
  assert.equal(result.cancellationRatePercent, 50);
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

test("deduplica el mismo evento sin eliminar eventos distintos de la misma oferta", () => {
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
});

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

test("resuelve empates de timestamp de forma determinista", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        offerUuid: "z-offer",
        dedupeKey: "z",
        eventAt: "2026-10-02T12:00:00Z",
        observedAt: "2026-10-02T12:00:01Z",
      }),
      event({
        offerUuid: "a-offer",
        dedupeKey: "a",
        eventAt: "2026-10-02T12:00:00Z",
        observedAt: "2026-10-02T12:00:01Z",
        rate: 2000,
        receive: 20000,
        amount: 10,
      }),
    ],
    "BANK_CUP",
    { windowSize: 1 },
  );
  assert.equal(result.completedCount, 1);
  assert.equal(result.minRate, 1000);
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

test("rechaza silenciosamente métricas numéricas inválidas", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        offerUuid: "valid",
        amount: 2,
        receive: 200,
        rate: 100,
      }),
      event({
        offerUuid: "invalid",
        amount: Number.NaN,
        receive: Number.NaN,
        rate: Number.NaN,
      }),
    ],
    "BANK_CUP",
  );

  assert.equal(result.completedCount, 1);
  assert.equal(result.minRate, 100);
  assert.equal(result.maxRate, 100);
  assert.equal(result.vwap, 100);
  assert.equal(result.tradedVolumeQusd, 2);
});

test("excluye operaciones completadas con rate inconsistente", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        offerUuid: "valid",
        amount: 2,
        receive: 200,
        rate: 100,
      }),
      event({
        offerUuid: "inconsistent",
        amount: 2,
        receive: 200,
        rate: 101,
      }),
    ],
    "BANK_CUP",
  );

  assert.equal(result.completedCount, 1);
  assert.equal(result.vwap, 100);
  assert.equal(result.tradedVolumeQusd, 2);
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

test("separa precios de referencia por lado y conserva freshness", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        offerUuid: "buy-1",
        dedupeKey: "buy-1",
        side: "buy",
        amount: 1,
        receive: 100,
        rate: 100,
        eventAt: "2026-10-02T11:00:00Z",
        observedAt: "2026-10-02T11:00:01Z",
      }),
      event({
        offerUuid: "buy-2",
        dedupeKey: "buy-2",
        side: "buy",
        amount: 2,
        receive: 400,
        rate: 200,
        eventAt: "2026-10-02T11:30:00Z",
        observedAt: "2026-10-02T11:30:01Z",
      }),
      event({
        offerUuid: "buy-outlier",
        dedupeKey: "buy-outlier",
        side: "buy",
        amount: 1,
        receive: 1000,
        rate: 1000,
        eventAt: "2026-10-02T11:45:00Z",
        observedAt: "2026-10-02T11:45:01Z",
      }),
      event({
        offerUuid: "buy-invalid",
        dedupeKey: "buy-invalid",
        side: "buy",
        amount: null,
        receive: 100,
        rate: null,
        eventAt: "2026-10-02T11:48:00Z",
        observedAt: "2026-10-02T11:48:01Z",
      }),
      event({
        offerUuid: "sell-1",
        dedupeKey: "sell-1",
        side: "sell",
        amount: 1,
        receive: 300,
        rate: 300,
        eventAt: "2026-10-02T10:00:00Z",
        observedAt: "2026-10-02T10:00:01Z",
      }),
      event({
        offerUuid: "sell-2",
        dedupeKey: "sell-2",
        side: "sell",
        amount: 1,
        receive: 400,
        rate: 400,
        eventAt: "2026-10-02T10:05:00Z",
        observedAt: "2026-10-02T10:05:01Z",
      }),
      event({
        offerUuid: "other-coin",
        dedupeKey: "other-coin",
        coin: "USDT",
        side: "buy",
        amount: 1,
        receive: 9999,
        rate: 9999,
        eventAt: "2026-10-02T11:59:00Z",
        observedAt: "2026-10-02T11:59:01Z",
      }),
    ],
    "BANK_CUP",
    { now: NOW, maxAgeMs: 60 * 60 * 1000 },
  );

  assert.equal(result.referencePrices.buy?.sampleCount, 3);
  assert.equal(result.referencePrices.buy?.medianRate, 200);
  assert.equal(result.referencePrices.buy?.vwap, 375);
  assert.equal(result.referencePrices.sell?.sampleCount, 2);
  assert.equal(result.referencePrices.sell?.medianRate, 350);
  assert.equal(result.referencePrices.sell?.vwap, 350);
  assert.equal(result.referencePrices.buy?.stale, false);
  assert.equal(result.referencePrices.sell?.stale, true);
  assert.equal(result.referencePrices.buy?.quality.sampleCount, 4);
  assert.equal(result.referencePrices.buy?.quality.usableSampleCount, 3);
  assert.equal(
    result.referencePrices.buy?.quality.invalidFieldExcludedCount,
    1,
  );
  assert.equal(result.referencePrices.buy?.quality.outlierExcludedCount, 0);
  assert.equal(result.referencePrices.buy?.quality.excludedSampleCount, 1);
  assert.equal(result.referencePrices.buy?.quality.belowMinimumSample, true);
  assert.equal(result.referencePrices.sell?.quality.staleObservationCount, 2);
  assert.equal(result.referencePrices.sell?.quality.lifecycleCompleteCount, 2);
  assert.equal(result.referencePrices.sell?.quality.timeSpanMs, 5 * 60 * 1000);
});

test("cuenta canceladas en la misma ventana terminal que las completadas", () => {
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
  assert.equal(result.terminalCount, 2);
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

test("ignora tiempos de finalización negativos por timestamps inconsistentes", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        offerUuid: "negative",
        dedupeKey: "created-negative",
        event: "created",
        eventAt: "2026-10-02T12:00:00Z",
      }),
      event({
        offerUuid: "negative",
        dedupeKey: "completed-negative",
        eventAt: "2026-10-02T11:00:00Z",
      }),
      event({
        offerUuid: "valid",
        dedupeKey: "created-valid",
        event: "created",
        eventAt: "2026-10-02T10:00:00Z",
      }),
      event({
        offerUuid: "valid",
        dedupeKey: "completed-valid",
        eventAt: "2026-10-02T11:00:00Z",
      }),
    ],
    "BANK_CUP",
  );
  assert.equal(result.completedCount, 2);
  assert.equal(result.averageTimeToCompletionMs, 60 * 60 * 1000);
});

test("omite el tiempo de finalización cuando falta el evento created", () => {
  const result = calculateCurrencyAnalytics(
    [
      event({
        offerUuid: "without-created",
        dedupeKey: "completed-only",
        eventAt: "2026-10-02T11:00:00Z",
      }),
    ],
    "BANK_CUP",
  );
  assert.equal(result.completedCount, 1);
  assert.equal(result.averageTimeToCompletionMs, null);
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

test("preserva available_amount nulo y acepta cero explícito", () => {
  const missing = normalizeMarketEvent({
    offerUuid: "fixed-offer",
    event: "p2p.created",
    status: "open",
    coin: "BANK_CUP",
    amount: "10",
    receive: "10000",
    availableAmount: null,
    source: "webhook",
    eventAt: "2026-10-02T11:00:00Z",
  });
  assert.ok(missing);
  assert.equal(missing.availableAmount, null);

  const zero = normalizeMarketEvent({
    offerUuid: "flexible-offer",
    event: "p2p.created",
    status: "open",
    coin: "BANK_CUP",
    amount: "10",
    receive: "10000",
    availableAmount: "0",
    source: "webhook",
    eventAt: "2026-10-02T11:00:00Z",
  });
  assert.ok(zero);
  assert.equal(zero.availableAmount, 0);
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

test("detecta y conserva un evento futuro dentro de la tolerancia", () => {
  const result = normalizeMarketEvent(
    {
      offerUuid: "future-within-tolerance",
      event: "completed",
      coin: "BANK_CUP",
      amount: 10,
      receive: 10000,
      eventAt: "2026-10-02T12:04:00Z",
      observedAt: "2026-10-02T12:00:00Z",
      source: "webhook",
    },
    NOW,
  );
  assert.ok(result);
  assert.equal(result.timestampQuality, "valid");
  assert.equal(result.quarantined, false);
  assert.equal(result.sourceEventAt, "2026-10-02T12:04:00Z");
  assert.equal(result.sourceObservedAt, "2026-10-02T12:00:00Z");
});

test("cuarentena eventos muy futuros sin alterar su timestamp de origen", () => {
  const result = normalizeMarketEvent(
    {
      offerUuid: "future-severe",
      event: "completed",
      coin: "BANK_CUP",
      amount: 10,
      receive: 10000,
      eventAt: "2026-10-02T12:10:00Z",
      observedAt: "2026-10-02T12:00:00Z",
      source: "webhook",
    },
    NOW,
  );
  assert.ok(result);
  assert.equal(result.timestampQuality, "future_skew");
  assert.equal(result.quarantined, true);
  assert.equal(result.sourceEventAt, "2026-10-02T12:10:00Z");
  assert.equal(result.eventAt, "2026-10-02T12:10:00.000Z");
});

test("excluye eventos en cuarentena de la reconciliación y los expone para observabilidad", () => {
  const result = reconcileMarketEventLifecycle([
    event({
      offerUuid: "quarantined",
      event: "completed",
      eventAt: "2026-10-02T12:10:00Z",
      observedAt: "2026-10-02T12:00:00Z",
      timestampQuality: "future_skew",
      quarantined: true,
    }),
    event({
      offerUuid: "valid",
      event: "completed",
      eventAt: "2026-10-02T11:59:00Z",
      observedAt: "2026-10-02T12:00:00Z",
    }),
  ]);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.offerUuid, "valid");
  assert.equal(result.quarantinedEvents.length, 1);
  assert.equal(result.futureSkewCount, 1);
  assert.equal(result.quarantinedEvents[0]?.offerUuid, "quarantined");
});

test("rechaza timestamps malformados y conserva el fallback determinista", () => {
  const result = normalizeMarketEvent(
    {
      offerUuid: "malformed",
      event: "completed",
      coin: "BANK_CUP",
      amount: 10,
      receive: 10000,
      eventAt: "not-a-date",
      updatedAt: "2026-10-02T11:00:00Z",
      observedAt: "2026-10-02T11:00:01Z",
      source: "webhook",
    },
    NOW,
  );
  assert.ok(result);
  assert.equal(result.eventAt, "2026-10-02T11:00:00.000Z");
  assert.equal(result.timestampQuality, "valid");
  assert.equal(result.quarantined, false);
});

test("rechaza eventos sin ningún timestamp utilizable", () => {
  assert.equal(
    normalizeMarketEvent(
      {
        offerUuid: "missing-timestamp",
        event: "completed",
        coin: "BANK_CUP",
        amount: 10,
        receive: 10000,
        eventAt: "not-a-date",
        updatedAt: "also-not-a-date",
        createdAt: "",
        source: "webhook",
      },
      NOW,
    ),
    null,
  );
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
