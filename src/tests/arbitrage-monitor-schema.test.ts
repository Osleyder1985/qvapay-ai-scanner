import { strict as assert } from "node:assert";
import test from "node:test";
import { ensureArbitrageMonitorSchema } from "../cloudflare/arbitrage-monitor.js";
import type { D1Database, D1PreparedStatement } from "../cloudflare/d1.js";

function statement(
  query: string,
  queries: string[],
  rows: Array<{ name: string }> = [],
): D1PreparedStatement {
  queries.push(query);
  return {
    bind: () => statement(query, queries, rows),
    run: async <T>() => ({ success: true }) as { success: boolean } & T,
    all: async <T>() =>
      ({ success: true, results: rows }) as {
        success: boolean;
        results: T[];
      },
    first: async () => null,
  };
}

test("monitor schema fallback creates and seeds missing tables", async () => {
  const queries: string[] = [];
  const db: D1Database = {
    prepare: (query) => statement(query, queries),
    batch: async <T>(statements: D1PreparedStatement[]) =>
      statements.map(
        () =>
          ({ success: true, meta: { changes: 0 } }) as {
            success: boolean;
            meta: { changes: number };
          } & T,
      ),
  };

  await ensureArbitrageMonitorSchema(db);

  assert.equal(queries.length, 5);
  assert.ok(queries[0]?.includes("sqlite_master"));
  assert.ok(queries[1]?.includes("CREATE TABLE IF NOT EXISTS arbitrage_monitor_config"));
  assert.ok(queries[2]?.includes("CREATE TABLE IF NOT EXISTS arbitrage_monitor_state"));
  assert.ok(queries[3]?.includes("INSERT OR IGNORE INTO arbitrage_monitor_config"));
  assert.ok(queries[4]?.includes("INSERT OR IGNORE INTO arbitrage_monitor_state"));
});

test("monitor schema fallback is a no-op when both tables exist", async () => {
  const queries: string[] = [];
  const db: D1Database = {
    prepare: (query) =>
      statement(query, queries, [
        { name: "arbitrage_monitor_config" },
        { name: "arbitrage_monitor_state" },
      ]),
    batch: async () => {
      throw new Error("batch should not run");
    },
  };

  await ensureArbitrageMonitorSchema(db);

  assert.equal(queries.length, 1);
  assert.ok(queries[0]?.includes("sqlite_master"));
});
