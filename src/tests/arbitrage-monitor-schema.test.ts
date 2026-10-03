import { strict as assert } from "node:assert";
import test from "node:test";
import {
  ensureArbitrageMonitorSchema,
} from "../cloudflare/arbitrage-monitor.js";
import type { D1Database, D1PreparedStatement } from "../cloudflare/d1.js";

function statement(query: string, queries: string[]): D1PreparedStatement {
  queries.push(query);
  return {
    bind: () => statement(query, queries),
    run: async <T>() => ({ success: true }) as { success: boolean } & T,
    all: async <T>() =>
      ({ success: true, results: [] }) as {
        success: boolean;
        results: T[];
      },
    first: async () => null,
  };
}

test("monitor schema is created and seeded idempotently", async () => {
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
  assert.ok(queries[0]?.includes("CREATE TABLE IF NOT EXISTS arbitrage_monitor_config"));
  assert.ok(queries[1]?.includes("CREATE TABLE IF NOT EXISTS arbitrage_monitor_state"));
  assert.ok(queries[2]?.includes("CREATE INDEX IF NOT EXISTS idx_arbitrage_monitor_state_scanned_at"));
  assert.ok(queries[3]?.includes("INSERT OR IGNORE INTO arbitrage_monitor_config"));
  assert.ok(queries[4]?.includes("INSERT OR IGNORE INTO arbitrage_monitor_state"));
});

test("monitor schema guard fails closed when D1 rejects schema creation", async () => {
  const db: D1Database = {
    prepare: (query) => statement(query, []),
    batch: async <T>() =>
      [
        {
          success: false,
          meta: { changes: 0 },
        },
      ] as Array<{ success: boolean; meta: { changes: number } } & T>,
  };

  await assert.rejects(
    ensureArbitrageMonitorSchema(db),
    /ARBITRAGE_MONITOR_SCHEMA_ENSURE_FAILED/,
  );
});
