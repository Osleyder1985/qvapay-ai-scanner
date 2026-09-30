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
