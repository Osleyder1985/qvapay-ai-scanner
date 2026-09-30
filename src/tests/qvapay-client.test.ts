/**
 * @file qvapay-client.test.ts
 * @path src/tests/qvapay-client.test.ts
 * @description Tests the Worker-compatible QvaPay HTTP client.
 * @module tests
 * @status active
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { createQvaPayClient } from "../backend/cloudflare/qvapay-client.js";

test("QvaPay client builds authenticated P2P GET requests", async () => {
  let captured: Request | null = null;

  const client = createQvaPayClient({
    appId: "test-app",
    appSecret: "test-secret",
    fetchImpl: async (input, init) => {
      captured = new Request(input, init);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });

  const result = await client.getP2P(
    new URLSearchParams({ type: "sell", coin: "USDT", take: "10" }),
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, { data: [] });
  assert.ok(captured);
  assert.equal(captured!.method, "GET");
  assert.equal(captured!.headers.get("app-id"), "test-app");
  assert.equal(captured!.headers.get("app-secret"), "test-secret");

  const url = new URL(captured!.url);
  assert.equal(url.pathname, "/p2p");
  assert.equal(url.searchParams.get("type"), "sell");
  assert.equal(url.searchParams.get("coin"), "USDT");
});

test("QvaPay client builds own-P2P query", async () => {
  let capturedUrl = "";

  const client = createQvaPayClient({
    appId: "test-app",
    appSecret: "test-secret",
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });

  await client.getOwnP2P("processing");

  const url = new URL(capturedUrl);
  assert.equal(url.pathname, "/p2p");
  assert.equal(url.searchParams.get("my"), "1");
  assert.equal(url.searchParams.get("status"), "processing");
  assert.equal(url.searchParams.get("take"), "100");
});

test("QvaPay client posts an apply mutation and preserves upstream rejection", async () => {
  let captured: Request | null = null;

  const client = createQvaPayClient({
    appId: "test-app",
    appSecret: "test-secret",
    fetchImpl: async (input, init) => {
      captured = new Request(input, init);
      return new Response(
        JSON.stringify({ message: "VIP required" }),
        { status: 400 },
      );
    },
  });

  const result = await client.applyP2POffer("offer/123");

  assert.equal(result.status, 400);
  assert.equal(result.ok, false);
  assert.deepEqual(result.payload, { message: "VIP required" });
  assert.ok(captured);
  assert.equal(captured!.method, "POST");
  assert.equal(new URL(captured!.url).pathname, "/p2p/offer%2F123/apply");
});

test("QvaPay client rejects invalid credentials before network access", () => {
  assert.throws(
    () =>
      createQvaPayClient({
        appId: " ",
        appSecret: "test-secret",
        fetchImpl: async () => {
          throw new Error("network should not run");
        },
      }),
    /credentials are required/,
  );
});
