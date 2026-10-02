import { strict as assert } from "node:assert";
import test from "node:test";
import {
  appendMarketEvents,
  d1Health,
  queryMarketHistory,
  type D1Database,
  type D1PreparedStatement,
} from "../cloudflare/d1.js";

function statement(result: unknown): D1PreparedStatement {
  return {
    bind: () => statement(result),
    run: async <T>() => ({ success: true }) as { success: boolean } & T,
    all: async <T>() =>
      ({
        success: true,
        results: result as T[],
      }) as { success: boolean; results: T[] },
    first: async () => null,
  };
}

test("D1 health reports the required runtime tables", async () => {
  const db: D1Database = {
    prepare: () =>
      statement([
        { name: "auto_apply_config" },
        { name: "finance_ledger" },
        { name: "market_history" },
        { name: "market_events" },
        { name: "operations_ledger" },
      ]),
    batch: async () => [],
  };

  const health = await d1Health(db);

  assert.equal(health.ok, true);
  assert.deepEqual(health.tables, [
    "auto_apply_config",
    "finance_ledger",
    "market_events",
    "market_history",
    "operations_ledger",
  ]);
});

test("D1 market history query normalizes stored numeric fields", async () => {
  const db: D1Database = {
    prepare: () =>
      statement([
        {
          timestamp: "2026-10-01T00:00:00.000Z",
          coin: "USDT",
          type: "sell",
          samples: "3",
          min_rate: "410",
          median_rate: "412",
          max_rate: "415",
          spread: "5",
        },
      ]),
    batch: async () => [],
  };

  const points = await queryMarketHistory(db, "usdt", "SELL", 200);

  assert.deepEqual(points, [
    {
      timestamp: "2026-10-01T00:00:00.000Z",
      coin: "USDT",
      type: "sell",
      samples: 3,
      minRate: 410,
      medianRate: 412,
      maxRate: 415,
      spread: 5,
    },
  ]);
});

test("D1 market event persistence uses deterministic newest-observation upsert", async () => {
  const queries: string[] = [];
  const db: D1Database = {
    prepare: (query) => {
      queries.push(query);
      return statement([]);
    },
    batch: async () => [],
  };

  await appendMarketEvents(db, [
    {
      dedupeKey: "offer-1|completed",
      eventId: "event-1",
      offerUuid: "offer-1",
      event: "completed",
      status: "completed",
      side: "sell",
      coin: "BANK_CUP",
      amount: 10,
      availableAmount: 0,
      receive: 12000,
      rate: 1200,
      eventAt: "2026-10-02T12:00:00.000Z",
      observedAt: "2026-10-02T12:00:01.000Z",
      source: "webhook",
    },
  ]);

  assert.ok(queries[0]?.includes("ON CONFLICT(dedupe_key) DO UPDATE SET"));
  assert.ok(queries[0]?.includes("excluded.observed_at > market_events.observed_at"));
});

test("D1 market event persistence chunks large batches", async () => {
  const batchSizes: number[] = [];
  const db: D1Database = {
    prepare: () => statement([]),
    batch: async <T>(
      statements: D1PreparedStatement[],
    ): Promise<Array<{ success: boolean; meta: { changes: number } } & T>> => {
      batchSizes.push(statements.length);
      return statements.map(
        () =>
          ({ success: true, meta: { changes: 1 } }) as {
            success: boolean;
            meta: { changes: number };
          } & T,
      );
    },
  };

  const events = Array.from({ length: 251 }, (_, index) => ({
    dedupeKey: `offer-${index}|completed`,
    eventId: `event-${index}`,
    offerUuid: `offer-${index}`,
    event: "completed",
    status: "completed",
    side: "sell",
    coin: "BANK_CUP",
    amount: 10,
    availableAmount: 10,
    receive: 12000,
    rate: 1200,
    eventAt: "2026-10-02T12:00:00.000Z",
    observedAt: "2026-10-02T12:00:01.000Z",
    source: "webhook",
  }));

  const inserted = await appendMarketEvents(db, events);

  assert.equal(inserted, 251);
  assert.deepEqual(batchSizes, [250, 1]);
});
