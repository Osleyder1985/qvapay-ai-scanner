/**
 * @file trend-engine.test.ts
 * @path src/tests/trend-engine.test.ts
 * @description Cobertura de pruebas para trend-engine.test.ts en QvaPay AI Scanner.
 * @module tests
 * @status test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { calculateTrend, summarizeTrends } from "../backend/trend-engine.js";

const p = (
  timestamp: string,
  medianRate: number,
  coin = "BANK_CUP",
  type = "sell",
) => ({
  timestamp,
  medianRate,
  minRate: medianRate - 1,
  maxRate: medianRate + 1,
  samples: 10,
  coin,
  type,
});

test("calculates absolute and percentage trend change", () => {
  const result = calculateTrend([
    p("2026-09-29T10:00:00Z", 100),
    p("2026-09-29T11:00:00Z", 105),
  ]);
  assert.equal(result.changeAbsolute, 5);
  assert.equal(result.changePercent, 5);
  assert.equal(result.direction, "up");
});

test("calculates downward trend", () => {
  const result = calculateTrend([
    p("2026-09-29T10:00:00Z", 100),
    p("2026-09-29T11:00:00Z", 95),
  ]);
  assert.equal(result.changePercent, -5);
  assert.equal(result.direction, "down");
});

test("groups trends by type and coin", () => {
  const result = summarizeTrends([
    p("2026-09-29T10:00:00Z", 100),
    p("2026-09-29T11:00:00Z", 105),
    p("2026-09-29T10:00:00Z", 200, "USDT", "buy"),
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.coin, "BANK_CUP");
  assert.equal(result[0]?.direction, "up");
});
