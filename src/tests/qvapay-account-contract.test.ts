/**
 * @file qvapay-account-contract.test.ts
 * @path src/tests/qvapay-account-contract.test.ts
 * @description Pruebas de contrato para identidad, balance y estado de integración QvaPay.
 * @module tests
 * @status active
 */

import assert from "node:assert/strict";
import test from "node:test";
import { evaluateQvaPayAccountContract } from "../cloudflare/qvapay-account-contract.js";
import { parseQvaPayApplicationIdentity } from "../cloudflare/qvapay-identity.js";
import { parseQvaPayBalance } from "../cloudflare/qvapay-balance.js";

const identity = {
  uuid: "app-uuid-123",
  name: "QvaPay AI Scanner",
  active: true,
  enabled: true,
};

test("accepts direct balance and zero", () => {
  assert.equal(
    parseQvaPayBalance({ balance: 125.5 }).balance?.balanceUsd,
    125.5,
  );
  assert.equal(parseQvaPayBalance({ balance: 0 }).balance?.balanceUsd, 0);
});

test("accepts the documented generic numeric envelope", () => {
  assert.equal(
    parseQvaPayBalance({ message: "Operación exitosa", data: 125.5 })
      .balance?.balanceUsd,
    125.5,
  );
});

test("rejects strings, booleans, non-finite, negative and ambiguous balances", () => {
  for (const payload of [
    { balance: "50" },
    { balance: true },
    { balance: Number.NaN },
    { balance: Number.POSITIVE_INFINITY },
    { balance: -1 },
    {},
    { balance: 50, extra: true },
    { data: { balance: 500 }, message: "Operación exitosa" },
    { balances: [{ balance: 500 }] },
  ]) {
    const parsed = parseQvaPayBalance(payload);
    assert.equal(
      parsed.ok,
      false,
      JSON.stringify(payload),
    );
    assert.equal(parsed.balance, null);
  }
});

test("accepts coherent identity only from the authoritative application response", () => {
  assert.deepEqual(parseQvaPayApplicationIdentity(identity), identity);
  assert.equal(
    parseQvaPayApplicationIdentity({
      User: { uuid: "p2p-user", name: "CRYPTOBRO" },
    }),
    null,
  );
  assert.equal(parseQvaPayApplicationIdentity({ uuid: identity.uuid }), null);
});

test("P2P User data cannot override the authoritative application identity", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: identity,
    balanceStatus: 200,
    balancePayload: { balance: 50 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.integrationStatus, "verified");
  assert.equal(result.user?.uuid, identity.uuid);
  assert.notEqual(result.user?.name, "CRYPTOBRO");
});

test("does not infer identity from a P2P User object", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: {
      User: { uuid: "p2p-user", name: "CRYPTOBRO" },
    },
    balanceStatus: 200,
    balancePayload: { balance: 50 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.user, null);
  assert.equal(result.integrationStatus, "degraded");
});

test("an authoritative identity plus a conflicting P2P-shaped balance payload is fail-closed", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: identity,
    balanceStatus: 200,
    balancePayload: {
      balance: 50,
      User: { uuid: "p2p-user", name: "CRYPTOBRO" },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.integrationStatus, "degraded");
  assert.equal(result.balanceUsd, null);
  assert.equal(result.user?.uuid, identity.uuid);
});

test("fails closed on HTTP failures and incompatible 200 payloads", () => {
  const httpFailure = evaluateQvaPayAccountContract({
    identityStatus: 401,
    identityPayload: { error: "invalid credentials", app_secret: "REDACTED" },
    balanceStatus: 503,
    balancePayload: "upstream unavailable",
  });

  assert.equal(httpFailure.ok, false);
  assert.equal(httpFailure.integrationStatus, "failed");
  assert.equal(httpFailure.user, null);
  assert.equal(httpFailure.balanceUsd, null);
  assert.equal(JSON.stringify(httpFailure).includes("app_secret"), false);

  const incompatible200 = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: identity,
    balanceStatus: 200,
    balancePayload: { data: { balance: 999999 } },
  });

  assert.equal(incompatible200.ok, false);
  assert.equal(incompatible200.balanceUsd, null);
});

test("partial dependency availability is degraded, never verified", () => {
  const balanceOnly = evaluateQvaPayAccountContract({
    identityStatus: 503,
    identityPayload: null,
    balanceStatus: 200,
    balancePayload: { balance: 25 },
  });
  assert.equal(balanceOnly.integrationStatus, "degraded");
  assert.equal(balanceOnly.ok, false);

  const identityOnly = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: identity,
    balanceStatus: 503,
    balancePayload: null,
  });
  assert.equal(identityOnly.integrationStatus, "degraded");
  assert.equal(identityOnly.ok, false);
});

test("total dependency failure is failed", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 503,
    identityPayload: null,
    balanceStatus: 503,
    balancePayload: null,
  });

  assert.equal(result.ok, false);
  assert.equal(result.integrationStatus, "failed");
});

test("contract output never contains raw upstream secrets or payloads", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: {
      ...identity,
      "app-secret": "must-not-escape",
      nested: { token: "must-not-escape" },
    },
    balanceStatus: 200,
    balancePayload: { balance: 10, "app-secret": "must-not-escape" },
  });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("must-not-escape"), false);
  assert.equal(serialized.includes("app-secret"), false);
});
