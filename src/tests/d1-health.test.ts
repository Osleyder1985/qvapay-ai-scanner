import assert from "node:assert/strict";
import test from "node:test";
import { d1Health, type D1Database, type D1PreparedStatement } from "../cloudflare/d1.js";

function statement(results: Array<{ name: string }>): D1PreparedStatement {
  return {
    bind() {
      return this;
    },
    async run() {
      return { success: true };
    },
    async all() {
      return { success: true, results };
    },
    async first() {
      return null;
    },
  };
}

test("d1Health requires every runtime table used by the auditor", async () => {
  const tables = [
    "arbitrage_monitor_config",
    "arbitrage_monitor_state",
    "auto_apply_config",
    "finance_ledger",
    "market_events",
    "market_history",
    "operations_ledger",
  ];

  const db: D1Database = {
    prepare() {
      return statement(tables);
    },
    async batch() {
      return [];
    },
  };

  const health = await d1Health(db);
  assert.equal(health.ok, true);
  assert.deepEqual(health.tables, [...tables].sort());
});

test("d1Health reports degraded when a required runtime table is missing", async () => {
  const tables = [
    "arbitrage_monitor_config",
    "arbitrage_monitor_state",
    "auto_apply_config",
    "finance_ledger",
    "market_events",
    "market_history",
  ];

  const db: D1Database = {
    prepare() {
      return statement(tables);
    },
    async batch() {
      return [];
    },
  };

  const health = await d1Health(db);
  assert.equal(health.ok, false);
});
