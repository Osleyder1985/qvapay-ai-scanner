/**
 * @file worker-operations.test.ts
 * @path src/tests/worker-operations.test.ts
 * @description Verifies the authenticated Cloudflare D1 operations read boundary.
 * @module tests
 * @status migration
 */

import assert from "node:assert/strict";
import test from "node:test";
import worker, { type WorkerEnv } from "../worker/index.js";

function createDb(rows: Record<string, unknown>[] = []): WorkerEnv["DB"] {
  return {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) {
          return this;
        },
        async run() {
          return { success: true };
        },
        async first<T>() {
          if (sql.includes("SELECT 1")) return { ok: 1 } as T;
          return null;
        },
        async all<T>() {
          return { results: rows as T[] };
        },
      };
    },
  };
}

test("operations D1 read rejects unauthenticated requests", async () => {
  const response = await worker.fetch(
    new Request("https://scanner.example/api/cloudflare/d1/operations"),
    { DB: createDb(), DASHBOARD_API_TOKEN: "test-token" },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "No autorizado" });
});

test("operations D1 read preserves raw operation shape when available", async () => {
  const row = {
    uuid: "op-1",
    type: "sell",
    status: "processing",
    amount: 10,
    receive: 10400,
    current_user_id: "42",
    user_uuid: null,
    user_id: "42",
    user_username: "owner",
    user_name: "Owner",
    peer_uuid: "peer-1",
    peer_id: "43",
    peer_username: "peer",
    peer_name: "Peer",
    recorded_at: "2026-09-30T00:00:00.000Z",
    last_seen_at: "2026-09-30T00:01:00.000Z",
    raw_json: JSON.stringify({
      uuid: "op-1",
      type: "sell",
      status: "processing",
      amount: 10,
      receive: 10400,
      User: { id: "42", username: "owner" },
      Peer: { id: "43", username: "peer" },
    }),
  };

  const response = await worker.fetch(
    new Request(
      "https://scanner.example/api/cloudflare/d1/operations?limit=25",
      { headers: { authorization: "Bearer test-token" } },
    ),
    { DB: createDb([row]), DASHBOARD_API_TOKEN: "test-token" },
  );

  assert.equal(response.status, 200);
  const body = await response.json() as {
    operations: { data: Array<Record<string, unknown>>; per_page: number };
    source: { persistence: string };
  };

  assert.equal(body.operations.per_page, 25);
  assert.equal(body.operations.data[0]?.uuid, "op-1");
  assert.equal(body.operations.data[0]?.status, "processing");
  assert.equal(body.source.persistence, "d1");
});

test("D1 health remains available without dashboard authorization", async () => {
  const response = await worker.fetch(
    new Request("https://scanner.example/api/cloudflare/d1/health"),
    { DB: createDb() },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    service: "qvapay-ai-scanner",
    d1: "ok",
  });
});
