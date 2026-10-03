/**
 * @file qvapay-balance.test.ts
 * @path src/tests/qvapay-balance.test.ts
 * @description Verifica las variantes reales/documentadas del contrato de balance QvaPay.
 * @module tests
 * @status test
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseQvaPayBalance } from "../cloudflare/qvapay-balance.js";

test("accepts the documented QvaPay balance response", () => {
  assert.deepEqual(parseQvaPayBalance({ balance: 150.75 }), {
    ok: true,
    balance: { balanceUsd: 150.75 },
    reason: null,
  });
});

test("accepts a generic data envelope with nested balance", () => {
  assert.deepEqual(
    parseQvaPayBalance({
      message: "Operación exitosa",
      data: { balance: 42.5 },
    }),
    {
      ok: true,
      balance: { balanceUsd: 42.5 },
      reason: null,
    },
  );
});

test("accepts numeric primitive and numeric string payloads", () => {
  assert.deepEqual(parseQvaPayBalance(18.25), {
    ok: true,
    balance: { balanceUsd: 18.25 },
    reason: null,
  });
  assert.deepEqual(parseQvaPayBalance("18.25"), {
    ok: true,
    balance: { balanceUsd: 18.25 },
    reason: null,
  });
});

test("accepts zero and rejects negative or non-numeric balances", () => {
  assert.equal(parseQvaPayBalance({ balance: 0 }).ok, true);
  assert.equal(parseQvaPayBalance({ balance: -0.01 }).ok, false);
  assert.equal(parseQvaPayBalance({ balance: "not-a-balance" }).ok, false);
  assert.equal(parseQvaPayBalance({ balance: true }).ok, false);
});

test("rejects missing or ambiguous balance fields", () => {
  assert.equal(parseQvaPayBalance({}).ok, false);
  assert.equal(parseQvaPayBalance({ balance: 10, currency: "USD" }).ok, false);
  assert.equal(
    parseQvaPayBalance({ balance: 10, data: { balance: 20 } }).ok,
    false,
  );
  assert.equal(parseQvaPayBalance([]).ok, false);
  assert.equal(parseQvaPayBalance(null).ok, false);
});
