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

test("accepts zero as a valid USD balance", () => {
  assert.deepEqual(parseQvaPayBalance({ balance: 0 }), {
    ok: true,
    balance: { balanceUsd: 0 },
    reason: null,
  });
});

test("rejects string, boolean, NaN and Infinity balances", () => {
  assert.equal(parseQvaPayBalance({ balance: "150.75" }).ok, false);
  assert.equal(parseQvaPayBalance({ balance: true }).ok, false);
  assert.equal(parseQvaPayBalance({ balance: Number.NaN }).ok, false);
  assert.equal(
    parseQvaPayBalance({ balance: Number.POSITIVE_INFINITY }).ok,
    false,
  );
});

test("rejects negative balances", () => {
  assert.equal(parseQvaPayBalance({ balance: -0.01 }).ok, false);
});

test("rejects missing or ambiguous balance fields", () => {
  assert.equal(parseQvaPayBalance({}).ok, false);
  assert.equal(parseQvaPayBalance({ balance: 10, currency: "USD" }).ok, false);
  assert.equal(
    parseQvaPayBalance({ balance: 10, data: { balance: 20 } }).ok,
    false,
  );
  assert.equal(parseQvaPayBalance({ data: { balance: 10 } }).ok, false);
});

test("rejects arrays, null and scalar payloads", () => {
  assert.equal(parseQvaPayBalance(null).ok, false);
  assert.equal(parseQvaPayBalance([]).ok, false);
  assert.equal(parseQvaPayBalance("150.75").ok, false);
  assert.equal(parseQvaPayBalance(150.75).ok, false);
});
