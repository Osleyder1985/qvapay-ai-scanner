import assert from "node:assert/strict";
import test from "node:test";
import { auditHealth } from "../cloudflare/ai-audit-routes.js";
import type { D1Database, D1PreparedStatement } from "../cloudflare/d1.js";

function statement(
  query: string,
  tables: Array<{ name: string }>,
  config: Record<string, unknown>,
  state: Record<string, unknown> | null,
): D1PreparedStatement {
  return {
    bind() {
      return this;
    },
    async all() {
      assert.match(query, /sqlite_master/);
      return { success: true, results: tables };
    },
    async first() {
      if (query.includes("arbitrage_monitor_config")) return config;
      if (query.includes("arbitrage_monitor_state")) return state;
      return null;
    },
    async run() {
      return { success: true };
    },
  } as unknown as D1PreparedStatement;
}

function env(state: Record<string, unknown> | null) {
  const tables = [
    "arbitrage_monitor_config",
    "arbitrage_monitor_state",
    "auto_apply_config",
    "finance_ledger",
    "market_events",
    "market_history",
    "operations_ledger",
  ].map((name) => ({ name }));
  const config = {
    enabled: 1,
    min_margin_percent: 5,
    coin: "BANK_CUP",
    schedule_enabled: 0,
    timezone: "UTC",
    start_local: null,
    end_local: null,
    active_days_json: "[1,2,3,4,5,6,7]",
  };
  const db: D1Database = {
    prepare(query) {
      return statement(query, tables, config, state);
    },
    async batch() {
      return [];
    },
  };
  return {
    DB: db,
    ARBITRAGE_MONITOR: {
      idFromName: () => "global",
      get: () => ({
        fetch: async () => Response.json({ alarm: null }),
      }),
    },
  };
}

test("AI Auditor health is degraded when monitor state is missing", async () => {
  const result = await auditHealth(env(null));
  assert.equal(result.ok, false);
});

test("AI Auditor health bootstraps the Durable Object when it has no alarm", async () => {
  const result = await auditHealth(
    env({
      status: "running",
      scan_id: "scan-1",
      scanned_at: "2026-10-02T20:00:00.000Z",
      next_run_at: "2026-10-02T20:00:10.000Z",
      last_success_at: "2026-10-02T20:00:00.000Z",
      last_error: null,
      payload_json: "{}",
      updated_at: "2026-10-02T20:00:00.000Z",
    }),
  );
  assert.equal(result.ok, true);
});
