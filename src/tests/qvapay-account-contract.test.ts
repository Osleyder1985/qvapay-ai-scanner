import assert from "node:assert/strict";
import test from "node:test";
import { evaluateQvaPayAccountContract } from "../cloudflare/qvapay-account-contract.js";

const identity = {
  uuid: "app-uuid-123",
  name: "QvaPay AI Scanner",
  active: true,
  enabled: true,
};

test("accepts coherent identity and positive balance", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: identity,
    balanceStatus: 200,
    balancePayload: { balance: 125.5 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.integrationStatus, "verified");
  assert.equal(result.user?.name, "QvaPay AI Scanner");
  assert.equal(result.balanceUsd, 125.5);
  assert.equal(result.identityError, null);
  assert.equal(result.balanceError, null);
});

test("accepts zero balance", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: identity,
    balanceStatus: 200,
    balancePayload: { balance: 0 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.integrationStatus, "verified");
  assert.equal(result.balanceUsd, 0);
});

test("fails closed when identity is missing", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: null,
    balanceStatus: 200,
    balancePayload: { balance: 50 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.integrationStatus, "degraded");
  assert.equal(result.user, null);
  assert.equal(result.balanceUsd, 50);
  assert.notEqual(result.identityError, null);
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
});

test("fails closed when identity and P2P data conflict", () => {
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
  assert.equal(result.balanceUsd, null);
  assert.notEqual(result.balanceError, null);
  assert.equal(result.user?.uuid, "app-uuid-123");
});

test("fails closed on HTTP errors", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 401,
    identityPayload: { error: "invalid credentials", app_secret: "REDACTED" },
    balanceStatus: 503,
    balancePayload: "upstream unavailable",
  });

  assert.equal(result.ok, false);
  assert.equal(result.user, null);
  assert.equal(result.balanceUsd, null);
  assert.equal(result.identityError !== null, true);
  assert.equal(result.balanceError !== null, true);
  assert.equal(JSON.stringify(result).includes("app_secret"), false);
});

test("fails closed on HTTP 200 with incompatible balance payload", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: identity,
    balanceStatus: 200,
    balancePayload: { data: { balance: 999999 } },
  });

  assert.equal(result.ok, false);
  assert.equal(result.balanceUsd, null);
  assert.notEqual(result.balanceError, null);
});

test("fails closed on invalid JSON-shaped payloads and ambiguous balances", () => {
  for (const payload of [
    {},
    { balance: "50" },
    { balance: 50, data: { balance: 500 } },
    [],
    null,
  ]) {
    const result = evaluateQvaPayAccountContract({
      identityStatus: 200,
      identityPayload: identity,
      balanceStatus: 200,
      balancePayload: payload,
    });

    assert.equal(result.ok, false);
    assert.equal(result.balanceUsd, null);
  }
});

test("does not require P2P offers to establish account identity", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: identity,
    balanceStatus: 200,
    balancePayload: { balance: 10 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.user?.uuid, "app-uuid-123");
});


test("classifies balance-only availability as degraded", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 503,
    identityPayload: null,
    balanceStatus: 200,
    balancePayload: { balance: 25 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.integrationStatus, "degraded");
  assert.equal(result.identityValid, false);
  assert.equal(result.balanceValid, true);
});

test("classifies identity-only availability as degraded", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 200,
    identityPayload: identity,
    balanceStatus: 503,
    balancePayload: null,
  });

  assert.equal(result.ok, false);
  assert.equal(result.integrationStatus, "degraded");
  assert.equal(result.identityValid, true);
  assert.equal(result.balanceValid, false);
  assert.equal(result.balanceUsd, null);
});

test("classifies total dependency failure as failed", () => {
  const result = evaluateQvaPayAccountContract({
    identityStatus: 503,
    identityPayload: null,
    balanceStatus: 503,
    balancePayload: null,
  });

  assert.equal(result.ok, false);
  assert.equal(result.integrationStatus, "failed");
  assert.equal(result.identityValid, false);
  assert.equal(result.balanceValid, false);
});
