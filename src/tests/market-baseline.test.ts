/**
 * @file market-baseline.test.ts
 * @path src/tests/market-baseline.test.ts
 * @description Test coverage for market-baseline.test.ts in QvaPay AI Scanner.
 * @module tests
 * @status test
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBaseline,
  calculateBaselines,
} from "../backend/market-baseline.js";

const p = (
  timestamp: string,
  medianRate: number,
  coin = "BANK_CUP",
  type = "sell",
) => ({ timestamp, medianRate, samples: 10, coin, type });

test("calculates a recent mean baseline and current deviation", () => {
  const result = calculateBaseline([
    p("2026-09-29T10:00:00Z", 100),
    p("2026-09-29T11:00:00Z", 110),
    p("2026-09-29T12:00:00Z", 120),
  ]);
  assert.equal(result.baselineRate, 110);
  assert.equal(result.currentRate, 120);
  assert.equal(result.deviationPercent, 100 / 11);
  assert.equal(result.status, "above");
});

test("returns near status for small deviation", () => {
  const result = calculateBaseline([
    p("2026-09-29T10:00:00Z", 100),
    p("2026-09-29T11:00:00Z", 100.5),
  ]);
  assert.equal(result.status, "near");
});

test("groups baselines by market", () => {
  const result = calculateBaselines([
    p("2026-09-29T10:00:00Z", 100),
    p("2026-09-29T11:00:00Z", 105),
    p("2026-09-29T10:00:00Z", 200, "USDT", "buy"),
  ]);
  assert.equal(result.length, 2);
});
