/**
 * @file finance-settlement.test.ts
 * @path src/tests/finance-settlement.test.ts
 * @description Pruebas de integridad para settlements del ledger financiero D1.
 * @module tests
 * @status test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { recordFinanceSettlement, type D1Database } from "../cloudflare/d1.js";

function database(changes = 1): D1Database {
  return {
    prepare() {
      const statement = {
        bind() {
          return statement;
        },
        async run<T = unknown>() {
          return { success: true, meta: { changes } } as {
            success: boolean;
            meta: { changes: number };
          } & T;
        },
        async all() {
          return { success: true, results: [] };
        },
        async first() {
          return null;
        },
      };
      return statement;
    },
    async batch() {
      return [];
    },
  };
}

test("rechaza settlement con fee superior al gross", async () => {
  assert.equal(
    await recordFinanceSettlement(database(), "offer-1", {
      gross_amount: 100,
      fee: 101,
      amount: 0,
    }),
    false,
  );
});

test("rechaza settlement cuyo net no coincide con gross menos fee", async () => {
  assert.equal(
    await recordFinanceSettlement(database(), "offer-2", {
      gross_amount: 100,
      fee: 10,
      amount: 80,
    }),
    false,
  );
});

test("acepta settlement coherente con tolerancia de punto flotante", async () => {
  assert.equal(
    await recordFinanceSettlement(database(), "offer-3", {
      gross_amount: 100,
      fee: 0.1,
      amount: 99.9,
    }),
    true,
  );
});
