import test from "node:test";
import assert from "node:assert/strict";
import { queryMarketHistory, type D1Database } from "../cloudflare/d1.js";

test("market history returns newest points first", async () => {
  let query = "";
  const db: D1Database = {
    prepare(sql) {
      query = sql;
      return {
        bind() {
          return this;
        },
        async run() {
          return { success: true };
        },
        async all() {
          return {
            success: true,
            results: [
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
            ],
          };
        },
        async first() {
          return null;
        },
      };
    },
    batch: async () => [],
  };

  const history = await queryMarketHistory(db, "USDT", "sell", 10);

  assert.match(query, /ORDER BY timestamp DESC/);
  assert.equal(history[0]?.timestamp, "2026-10-01T12:00:00.000Z");
});
