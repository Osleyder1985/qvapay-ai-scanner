import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileLayerState } from "../backend/reconciliation.js";
import type { NormalizedMarketEvent } from "../backend/arbitrage-market-history.js";

function event(
  offerUuid: string,
  event: "created" | "completed" = "completed",
): NormalizedMarketEvent {
  return {
    dedupeKey: offerUuid + "|" + event,
    eventId: null,
    offerUuid,
    event,
    status: event,
    side: "sell",
    coin: "BANK_CUP",
    amount: 10,
    availableAmount: 0,
    receive: 10000,
    rate: 1000,
    eventAt: "2026-10-02T12:00:00.000Z",
    observedAt: "2026-10-02T12:00:01.000Z",
    source: "reconciliation",
    sourceEventAt: "2026-10-02T12:00:00Z",
    sourceObservedAt: "2026-10-02T12:00:01Z",
    timestampQuality: "valid",
    quarantined: false,
  };
}

test("reconciles complete event, operation, finance and market-history evidence", () => {
  const report = reconcileLayerState({
    events: [event("offer-1")],
    operations: [
      {
        uuid: "offer-1",
        payload: { uuid: "offer-1", status: "completed", coin: "BANK_CUP" },
      },
    ],
    finance: [{ uuid: "offer-1", status: "completed" }],
    marketHistory: [
      {
        timestamp: "2026-10-02T12:02:00.000Z",
        coin: "BANK_CUP",
        type: "sell",
      },
    ],
  });

  assert.deepEqual(report.eventMissingOperations, []);
  assert.deepEqual(report.operationMissingEvents, []);
  assert.deepEqual(report.operationMissingFinance, []);
  assert.deepEqual(report.financeMissingOperations, []);
  assert.deepEqual(report.marketHistoryMatchedCompletedEvents, ["offer-1"]);
  assert.deepEqual(report.marketHistoryUnmatchedCompletedEvents, []);
  assert.equal(report.idempotent, true);
});

test("detects delayed or missing counterparts without mutating any layer", () => {
  const report = reconcileLayerState({
    events: [event("event-only")],
    operations: [
      {
        uuid: "operation-only",
        payload: { uuid: "operation-only", status: "completed" },
      },
    ],
    finance: [{ uuid: "finance-only", status: "completed" }],
    marketHistory: [],
  });

  assert.deepEqual(report.eventMissingOperations, ["event-only"]);
  assert.deepEqual(report.operationMissingEvents, ["operation-only"]);
  assert.deepEqual(report.operationMissingFinance, ["operation-only"]);
  assert.deepEqual(report.financeMissingOperations, ["finance-only"]);
  assert.deepEqual(report.marketHistoryUnmatchedCompletedEvents, ["event-only"]);
});

test("quarantined events do not participate in cross-layer reconciliation", () => {
  const quarantined = {
    ...event("future"),
    quarantined: true,
    timestampQuality: "future_skew" as const,
  };
  const report = reconcileLayerState({
    events: [quarantined],
    operations: [],
    finance: [],
    marketHistory: [],
  });

  assert.deepEqual(report.completedEventIds, []);
  assert.deepEqual(report.eventMissingOperations, []);
});

test("reconciliation output is deterministic across input order", () => {
  const first = reconcileLayerState({
    events: [event("b"), event("a")],
    operations: [
      { uuid: "b", payload: { status: "completed" } },
      { uuid: "a", payload: { status: "completed" } },
    ],
    finance: [
      { uuid: "b", status: "completed" },
      { uuid: "a", status: "completed" },
    ],
    marketHistory: [],
  });
  const second = reconcileLayerState({
    events: [event("a"), event("b")],
    operations: [
      { uuid: "a", payload: { status: "completed" } },
      { uuid: "b", payload: { status: "completed" } },
    ],
    finance: [
      { uuid: "a", status: "completed" },
      { uuid: "b", status: "completed" },
    ],
    marketHistory: [],
  });

  assert.deepEqual(second, first);
});
