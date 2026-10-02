/**
 * @file ai-audit-sanitization.test.ts
 * @path src/tests/ai-audit-sanitization.test.ts
 * @description Verifica que el AI Auditor sólo expone campos explícitamente permitidos.
 * @module tests
 * @status active
 */

import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeObjectArray } from "../cloudflare/ai-audit-routes.js";

test("AI Auditor strips unknown persisted arbitrage fields", () => {
  const result = sanitizeObjectArray(
    [
      {
        uuid: "offer-1",
        coin: "BANK_CUP",
        purchaseRate: 1000,
        projectedGrossProfitFiat: 5000,
        payment_details: "must-not-leak",
        owner: "must-not-leak",
      },
      "invalid",
      null,
    ],
    ["uuid", "coin", "purchaseRate", "projectedGrossProfitFiat"],
  );

  assert.deepEqual(result, [
    {
      uuid: "offer-1",
      coin: "BANK_CUP",
      purchaseRate: 1000,
      projectedGrossProfitFiat: 5000,
    },
  ]);
});
