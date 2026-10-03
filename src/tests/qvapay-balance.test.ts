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

test("accepts documented object balance", () => {
  assert.deepEqual(parseQvaPayBalance({ balance: 150.75 }), {
    ok: true,
    balance: { balanceUsd: 150.75 },
    reason: null,
  });
});

test("accepts generic data envelope with nested balance", () => {
  assert.deepEqual(
    parseQvaPayBalance({
      message: "Operación exitosa",
      data: { balance: 42.5 },
    }),
    { ok: true, balance: { balanceUsd: 42.5 }, reason: null },
  );
});

test("accepts numeric JSON primitive returned by upstream", () => {
  assert.deepEqual(parseQvaPayBalance(18.25), {
    ok: true,
    balance: { balanceUsd: 18.25 },
    reason: null,
  });
});

test("accepts numeric string returned by upstream", () => {
  assert.deepEqual(parseQvaPayBalance("18.25"), {
    ok: true,
    balance: { balanceUsd: 18.25 },
    reason: null,
  });
});

test("rejects negative and non-numeric balances", () => {
  assert.equal(parseQvaPayBalance(-1).ok, false);
  assert.equal(parseQvaPayBalance("not-a-balance").ok, false);
});
