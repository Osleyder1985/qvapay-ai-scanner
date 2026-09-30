/**
 * @file finance.test.ts
 * @path src/tests/finance.test.ts
 * @description finance.test.ts source for QvaPay AI Scanner.
 * @module tests
 * @status test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { calculateFinanceSummary } from "../backend/finance.js";

test("FIFO calculates realized profit from completed buy then sell", () => {
  const result = calculateFinanceSummary([
    { uuid: "b1", status: "completed", type: "buy", amount: 10, receive: 100, updated_at: "2026-01-01T00:00:00Z" },
    { uuid: "s1", status: "completed", type: "sell", amount: 4, receive: 48, updated_at: "2026-01-02T00:00:00Z" },
  ]);

  assert.equal(result.fiatExpense, 100);
  assert.equal(result.fiatIncome, 48);
  assert.equal(result.realizedProfit, 8);
  assert.equal(result.realizedProfitKnown, true);
  assert.equal(result.inventoryQusd, 6);
});

test("FIFO does not invent profit when sold QUSD has unknown opening cost", () => {
  const result = calculateFinanceSummary([
    { uuid: "s1", status: "completed", type: "sell", amount: 4, receive: 48, updated_at: "2026-01-02T00:00:00Z" },
  ]);

  assert.equal(result.realizedProfit, null);
  assert.equal(result.realizedProfitKnown, false);
  assert.equal(result.unknownCostQusd, 4);
});

test("ignores non-completed operations", () => {
  const result = calculateFinanceSummary([
    { uuid: "p1", status: "processing", type: "buy", amount: 10, receive: 100 },
  ]);

  assert.equal(result.completedCount, 0);
  assert.equal(result.fiatIncome, 0);
  assert.equal(result.fiatExpense, 0);
});

import { fetchAllCompletedP2P, reconcileCompletedIds } from "../backend/finance-reconciliation.js";

test("paginated reconciliation fetches every remote page", async () => {
  const calls: number[] = [];
  const result = await fetchAllCompletedP2P(async (page) => {
    calls.push(page);
    if (page === 1) return { data: [{ uuid: "a" }], total: 3, perPage: 1 };
    if (page === 2) return { data: [{ uuid: "b" }], total: 3, perPage: 1 };
    return { data: [{ uuid: "c" }], total: 3, perPage: 1 };
  });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(result.offers.length, 3);
  assert.equal(result.truncated, false);
});

test("reconciliation identifies missing and stale ledger entries", () => {
  const result = reconcileCompletedIds(
    [{ uuid: "a" }, { uuid: "b" }],
    [{ uuid: "a" }, { uuid: "old" }],
  );
  assert.deepEqual(result.missingInLedger, ["b"]);
  assert.deepEqual(result.staleLocal, ["old"]);
});
