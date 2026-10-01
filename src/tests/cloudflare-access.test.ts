import { strict as assert } from "node:assert";
import test from "node:test";
import {
  isSameOrigin,
  requireAccess,
  requiresSameOrigin,
  type WorkerAccessContext,
} from "../cloudflare/access.js";

test("Access is fail-closed when Cloudflare Access did not authenticate", async () => {
  const result = await requireAccess({});
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 403);
});

test("Access accepts an authenticated identity", async () => {
  const context: WorkerAccessContext = {
    access: {
      getIdentity: async () => ({ email: "admin@example.com" }),
    },
  };

  const result = await requireAccess(context);

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.identity.email, "admin@example.com");
});

test("Mutation requests require a same-origin Origin header", () => {
  const sameOrigin = new Request("https://scanner.example/api/operations/1/paid", {
    method: "POST",
    headers: { Origin: "https://scanner.example" },
  });
  const crossOrigin = new Request("https://scanner.example/api/operations/1/paid", {
    method: "POST",
    headers: { Origin: "https://evil.example" },
  });
  const missingOrigin = new Request(
    "https://scanner.example/api/operations/1/paid",
    { method: "POST" },
  );

  assert.equal(requiresSameOrigin(sameOrigin), true);
  assert.equal(isSameOrigin(sameOrigin), true);
  assert.equal(isSameOrigin(crossOrigin), false);
  assert.equal(isSameOrigin(missingOrigin), false);
});

test("Safe read requests do not require same-origin enforcement", () => {
  const request = new Request("https://scanner.example/api/p2p", {
    method: "GET",
  });

  assert.equal(requiresSameOrigin(request), false);
});
