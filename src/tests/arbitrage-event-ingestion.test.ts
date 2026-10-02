/**
 * @file arbitrage-event-ingestion.test.ts
 * @path src/tests/arbitrage-event-ingestion.test.ts
 * @description Pruebas de firma, normalización y reconciliación del histórico.
 * @module tests
 * @status test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ingestArbitrageWebhook,
  reconcileArbitrageHistory,
} from "../cloudflare/arbitrage-event-ingestion.js";

function mockDatabase() {
  const stored: unknown[][] = [];
  return {
    stored,
    prepare() {
      return {
        bind(...values: unknown[]) {
          stored.push(values);
          return this;
        },
        run: async () => ({ success: true, meta: { changes: 1 } }),
        all: async () => ({ success: true, results: [] }),
        first: async () => null,
      };
    },
    batch: async (statements: Array<{ run?: () => Promise<unknown> }>) =>
      statements.map(() => ({
        success: true,
        meta: { changes: 1 },
      })),
  };
}

async function signature(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return Array.from(digest, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

test("rechaza webhook sin firma válida", async () => {
  const db = mockDatabase();
  const response = await ingestArbitrageWebhook(
    new Request("https://scanner.example/api/arbitrage/webhook", {
      method: "POST",
      body: JSON.stringify({
        event: "p2p.completed",
        data: { uuid: "offer-1", coin: "BANK_CUP" },
      }),
    }),
    db as never,
    "secret",
  );
  assert.equal(response.status, 401);
});

test("rechaza webhook con cuerpo sobredimensionado", async () => {
  const db = mockDatabase();
  const response = await ingestArbitrageWebhook(
    new Request("https://scanner.example/api/arbitrage/webhook", {
      method: "POST",
      headers: { "content-length": String(256 * 1024 + 1) },
      body: "x",
    }),
    db as never,
    "secret",
  );
  assert.equal(response.status, 413);
  assert.equal(db.stored.length, 0);
});

test("acepta webhook firmado y persiste el evento normalizado", async () => {
  const db = mockDatabase();
  const body = JSON.stringify({
    event: "p2p.completed",
    sent_at: "2026-10-02T12:01:00.000Z",
    data: {
      uuid: "offer-1",
      type: "sell",
      coin: "BANK_CUP",
      amount: "10",
      receive: "12000",
      status: "completed",
      updated_at: "2026-10-02T12:00:00.000Z",
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await ingestArbitrageWebhook(
    new Request("https://scanner.example/api/arbitrage/webhook", {
      method: "POST",
      headers: {
        "x-qvapay-signature": `sha256=${await signature(body, "secret")}`,
        "x-qvapay-timestamp": timestamp,
      },
      body,
    }),
    db as never,
    "secret",
  );
  assert.equal(response.status, 202);
  assert.equal(db.stored.length, 1);
  assert.equal(db.stored[0]?.[0], "offer-1|completed");
  assert.equal(db.stored[0]?.[11], "2026-10-02T12:00:00.000Z");
});

test("reconciliación conserva estados terminales y omite estados no soportados", async () => {
  const db = mockDatabase();
  const env = {
    DB: db,
    QVAPAY_APP_ID: "app",
    QVAPAY_APP_SECRET: "secret",
  };

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            uuid: "completed-1",
            type: "sell",
            coin: "BANK_CUP",
            amount: 10,
            receive: 12000,
            status: "completed",
            created_at: "2026-10-02T11:00:00Z",
            updated_at: "2026-10-02T12:00:00Z",
          },
          {
            uuid: "revision-1",
            type: "sell",
            coin: "BANK_CUP",
            amount: 10,
            receive: 12000,
            status: "revision",
            updated_at: "2026-10-02T12:00:00Z",
          },
        ],
        total: 2,
        per_page: 100,
      }),
    );

  const result = await reconcileArbitrageHistory(env as never);
  assert.equal(result.fetched, 2);
  assert.equal(result.unsupported, 1);
  assert.equal(result.stored, 2);
  assert.deepEqual(
    db.stored.map((row) => row[0]),
    ["completed-1|created", "completed-1|completed"],
  );
});
