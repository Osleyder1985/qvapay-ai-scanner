import test from "node:test";
import assert from "node:assert/strict";
import {
  queryMarketHistory,
  type D1Database,
  type D1PreparedStatement,
} from "../cloudflare/d1.js";

test("market history returns newest points first", async () => {
  let query = "";
  const statement: D1PreparedStatement = {
    bind(..._values: unknown[]) {
      return statement;
    },
    async run<T = unknown>() {
      return {
        success: true,
      } as { success: boolean; meta?: { changes?: number } } & T;
    },
    async all<T = Record<string, unknown>>() {
      return {
        success: true,
        results: [
          {
            timestamp: "2026-10-02T12:00:00.000Z",
            coin: "USDT",
            type: "sell",
            samples: 2,
            min_rate: 1,
            median_rate: 1.5,
            max_rate: 2,
            spread: 1,
          },
          {
            timestamp: "2026-10-01T12:00:00.000Z",
            coin: "USDT",
            type: "sell",
            samples: 1,
            min_rate: 1,
            median_rate: 1,
            max_rate: 1,
            spread: 0,
          },
        ] as T[],
      };
    },
    async first<T = Record<string, unknown>>() {
      return null as T | null;
    },
  };

  const db: D1Database = {
    prepare(sql: string) {
      query = sql;
      return statement;
    },
    batch: async () => [],
  };

  const history = await queryMarketHistory(db, "USDT", "sell", 10);

  assert.match(query, /ORDER BY timestamp DESC/);
  assert.equal(history[0]?.timestamp, "2026-10-02T12:00:00.000Z");
  assert.equal(history[1]?.timestamp, "2026-10-01T12:00:00.000Z");
});
