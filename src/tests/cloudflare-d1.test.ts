import { strict as assert } from "node:assert";
import test from "node:test";
import {
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
