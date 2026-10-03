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
      now: "2026-10-02T12:05:00.000Z",
    });

    assert.deepEqual(report.eventMissingOperations, []);
    assert.deepEqual(report.operationMissingEvents, []);
    assert.deepEqual(report.operationMissingFinance, []);
    assert.deepEqual(report.financeMissingOperations, []);
    assert.deepEqual(report.marketHistoryMatchedCompletedEvents, ["offer-1"]);
    assert.deepEqual(report.marketHistoryUnmatchedCompletedEvents, []);
    assert.equal(report.idempotent, true);
    assert.deepEqual(report.discrepancies, []);
  },
);

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
    assert.deepEqual(report.marketHistoryUnmatchedCompletedEvents, [
      "event-only",
    ]);
  },
);

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
  },
);

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

test("emits machine-readable gap categories with source IDs and timestamps", () => {
    const report = reconcileLayerState({
      events: [event("event-only"), event("stale-event", "created")],
      operations: [
        {
          uuid: "operation-only",
          payload: {
            uuid: "conflicting-payload-id",
            status: "completed",
            updated_at: "2026-10-02T12:04:00.000Z",
          },
        },
      ],
      finance: [
        {
          uuid: "finance-only",
          status: "completed",
          timestamp: "2026-10-02T12:05:00.000Z",
        },
      ],
      marketHistory: [],
      now: "2026-10-02T12:20:00.000Z",
    });

    assert.deepEqual(
      report.discrepancies.map((item) => item.category),
      [
        "event_missing_operation",
        "finance_missing_operation",
        "market_history_unmatched_event",
        "operation_missing_event",
        "operation_missing_finance",
        "stale_lifecycle",
      ],
    );
    assert.ok(
      report.discrepancies.some(
        (item) =>
          item.category === "event_missing_operation" &&
          item.sourceIds.includes("event-only"),
      ),
    );
    assert.ok(
      report.discrepancies.every(
        (item) =>
          item.sourceIds.length > 0 &&
          item.timestamps.every((value) => Number.isFinite(Date.parse(value))),
      ),
    );
  },
);

test("detects conflicting operation identity", () => {
  const report = reconcileLayerState({
    events: [],
    operations: [
      {
        uuid: "operation-1",
        payload: {
          uuid: "operation-2",
          status: "completed",
          created_at: "2026-10-02T12:00:00.000Z",
        },
      },
    ],
    finance: [],
    marketHistory: [],
  });

  assert.deepEqual(
    report.discrepancies.filter(
      (item) => item.category === "conflicting_identity",
    ),
    [
      {
        category: "conflicting_identity",
        identity: "operation-1",
        sourceIds: ["operation-1", "operation-2"],
        timestamps: ["2026-10-02T12:00:00.000Z"],
      },
    ],
  );
});

test("detects duplicate identities without mutating source layers", () => {
    const input = {
      events: [],
      operations: [
        { uuid: "operation-1", payload: { status: "completed" } },
        { uuid: "operation-1", payload: { status: "completed" } },
      ],
      finance: [
        { uuid: "finance-1", status: "completed" },
        { uuid: "finance-1", status: "completed" },
      ],
      marketHistory: [],
    };
    const first = reconcileLayerState(input);
    const second = reconcileLayerState(input);

    assert.equal(
      first.discrepancies.filter(
        (item) => item.category === "duplicate_identity",
      ).length,
      2,
    );
    assert.deepEqual(second, first);
  },
);
