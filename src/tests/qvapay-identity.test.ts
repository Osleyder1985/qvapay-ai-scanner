import assert from "node:assert/strict";
import test from "node:test";
import { parseQvaPayApplicationIdentity } from "../cloudflare/qvapay-identity.js";

test("accepts a valid QvaPay application identity", () => {
  const identity = parseQvaPayApplicationIdentity({
    uuid: "app-uuid-123",
    name: "QvaPay AI Scanner",
    active: true,
    enabled: true,
  });

  assert.deepEqual(identity, {
    uuid: "app-uuid-123",
    name: "QvaPay AI Scanner",
    active: true,
    enabled: true,
  });
});

test("rejects an identity inferred from a P2P user without application fields", () => {
  const identity = parseQvaPayApplicationIdentity({
    User: {
      uuid: "user-uuid",
      name: "CRYPTOBRO",
    },
  });

  assert.equal(identity, null);
});

test("rejects an incomplete application identity", () => {
  assert.equal(
    parseQvaPayApplicationIdentity({
      uuid: "app-uuid-123",
      active: true,
      enabled: true,
    }),
    null,
  );

  assert.equal(
    parseQvaPayApplicationIdentity({
      name: "QvaPay AI Scanner",
      active: true,
      enabled: true,
    }),
    null,
  );
});

test("ignores malformed payloads", () => {
  assert.equal(parseQvaPayApplicationIdentity(null), null);
  assert.equal(parseQvaPayApplicationIdentity([]), null);
  assert.equal(parseQvaPayApplicationIdentity("invalid"), null);
});
