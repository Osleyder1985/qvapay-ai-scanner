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
          if (sql.includes("auto_apply_config")) return (rows[0] ?? null) as T | null;
          if (sql.includes("auto_apply_state")) return (rows[1] ?? null) as T | null;
          return (rows[0] ?? null) as T | null;
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
  const body = (await response.json()) as {
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

test("finance D1 read rejects unauthenticated requests", async () => {
  const response = await worker.fetch(
    new Request("https://scanner.example/api/cloudflare/d1/finance?uuid=op-1"),
    { DB: createDb(), DASHBOARD_API_TOKEN: "test-token" },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "No autorizado" });
});

test("finance D1 read validates the operation UUID", async () => {
  const response = await worker.fetch(
    new Request("https://scanner.example/api/cloudflare/d1/finance", {
      headers: { authorization: "Bearer test-token" },
    }),
    { DB: createDb(), DASHBOARD_API_TOKEN: "test-token" },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "El parámetro uuid es obligatorio",
  });
});

test("finance D1 read returns the fee-aware durable projection", async () => {
  const row = {
    uuid: "op-1",
    status: "completed",
    type: "sell",
    coin: "QUSD",
    amount: 10,
    receive: 10400,
    created_at: "2026-09-30T00:00:00.000Z",
    updated_at: "2026-09-30T00:01:00.000Z",
    recorded_at: "2026-09-30T00:00:00.000Z",
    gross_amount_qusd: 10,
    fee_qusd: 0.2,
    net_amount_qusd: 9.8,
    fee_source: "qvapay_received",
  };

  const response = await worker.fetch(
    new Request("https://scanner.example/api/cloudflare/d1/finance?uuid=op-1", {
      headers: { authorization: "Bearer test-token" },
    }),
    { DB: createDb([row]), DASHBOARD_API_TOKEN: "test-token" },
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    finance: Record<string, unknown>;
    source: { persistence: string };
  };

  assert.equal(body.finance.uuid, "op-1");
  assert.equal(body.finance.fee_qusd, 0.2);
  assert.equal(body.finance.net_amount_qusd, 9.8);
  assert.equal(body.finance.fee_source, "qvapay_received");
  assert.equal(body.source.persistence, "d1");
});

test("finance D1 read returns 404 when the entry does not exist", async () => {
  const response = await worker.fetch(
    new Request(
      "https://scanner.example/api/cloudflare/d1/finance?uuid=missing",
      { headers: { authorization: "Bearer test-token" } },
    ),
    { DB: createDb(), DASHBOARD_API_TOKEN: "test-token" },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Entrada financiera no encontrada",
  });
});


test("Auto-Apply D1 read rejects unauthenticated requests", async () => {
  const response = await worker.fetch(
    new Request("https://scanner.example/api/cloudflare/d1/auto-apply"),
    { DB: createDb(), DASHBOARD_API_TOKEN: "test-token" },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "No autorizado" });
});

test("Auto-Apply D1 read returns durable config and state", async () => {
  const config = {
    id: 1,
    enabled: 1,
    type: "sell",
    coin: "QUSD",
    rate_min: 1000,
    rate_max: 1100,
    amount_min: 5,
    amount_max: 100,
    daily_max_qusd: 500,
    max_concurrent: 2,
    updated_at: "2026-09-30T00:00:00.000Z",
  };
  const state = {
    id: 1,
    daily_date: "2026-09-30",
    daily_applied_qusd: 25,
    last_scan_at: "2026-09-30T00:01:00.000Z",
    last_action_at: "2026-09-30T00:01:30.000Z",
    last_message: "scan completed",
    updated_at: "2026-09-30T00:01:30.000Z",
  };
  const response = await worker.fetch(
    new Request("https://scanner.example/api/cloudflare/d1/auto-apply", {
      headers: { authorization: "Bearer test-token" },
    }),
    { DB: createDb([config, state]), DASHBOARD_API_TOKEN: "test-token" },
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    config: Record<string, unknown>;
    state: Record<string, unknown>;
    source: { persistence: string };
  };

  assert.equal(body.config.enabled, true);
  assert.equal(body.config.rate_min, 1000);
  assert.equal(body.state.daily_applied_qusd, 25);
  assert.equal(body.state.last_message, "scan completed");
  assert.equal(body.source.persistence, "d1");
});

test("Auto-Apply D1 read returns null state when no durable rows exist", async () => {
  const response = await worker.fetch(
    new Request("https://scanner.example/api/cloudflare/d1/auto-apply", {
      headers: { authorization: "Bearer test-token" },
    }),
    { DB: createDb(), DASHBOARD_API_TOKEN: "test-token" },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    config: null,
    state: null,
    source: { runtime: "cloudflare-worker", persistence: "d1" },
  });
});
