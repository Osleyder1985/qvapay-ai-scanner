/**
 * @file arbitrage-routes.test.ts
 * @path src/tests/arbitrage-routes.test.ts
 * @description Pruebas de la ruta Cloudflare de escaneo de arbitraje en modo lectura.
 * @module tests
 * @status test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { handleArbitrageRoutes } from "../cloudflare/arbitrage-routes.js";

const NOW = "2026-10-02T00:00:00.000Z";

test("expone el escaneo de arbitraje como lectura y construye una oportunidad real del payload P2P", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];

  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(
      JSON.stringify({
        data: [
          {
            uuid: "acquire",
            type: "sell",
            coin: "BANK_CUP",
            amount: 10,
            available_amount: 10,
            receive: 900,
            offer_kind: "fixed",
            updated_at: NOW,
          },
          {
            uuid: "exit",
            type: "buy",
            coin: "BANK_CUP",
            amount: 10,
            available_amount: 10,
            receive: 1000,
            offer_kind: "fixed",
            updated_at: NOW,
          },
        ],
        total: 2,
        per_page: 100,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const response = await handleArbitrageRoutes(
      new Request(
        "https://example.workers.dev/api/arbitrage/scan?maxCapitalFiat=900&maxAgeMs=120000",
      ),
      {
        DB: {} as never,
        QVAPAY_APP_ID: "test-app",
        QVAPAY_APP_SECRET: "test-secret",
      },
      new URL(
        "https://example.workers.dev/api/arbitrage/scan?maxCapitalFiat=900&maxAgeMs=120000",
      ),
      (payload, status = 200) =>
        new Response(JSON.stringify(payload), { status }),
    );

    assert.ok(response);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      mode: string;
      executionEnabled: boolean;
      opportunities: Array<{
        acquisitionOfferUuid: string;
        exitOfferUuid: string;
        quantityQusd: number;
      }>;
    };

    assert.equal(body.mode, "read-only");
    assert.equal(body.executionEnabled, false);
    assert.equal(body.opportunities.length, 1);
    assert.equal(body.opportunities[0]?.acquisitionOfferUuid, "acquire");
    assert.equal(body.opportunities[0]?.exitOfferUuid, "exit");
    assert.equal(body.opportunities[0]?.quantityQusd, 10);
    assert.equal(requests.length, 1);
    assert.match(requests[0] ?? "", /\/p2p\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valida el capital antes de consultar QvaPay", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("fetch no debería ejecutarse");
  };

  try {
    const response = await handleArbitrageRoutes(
      new Request("https://example.workers.dev/api/arbitrage/scan"),
      {
        DB: {} as never,
        QVAPAY_APP_ID: "test-app",
        QVAPAY_APP_SECRET: "test-secret",
      },
      new URL(
        "https://example.workers.dev/api/arbitrage/scan?maxCapitalFiat=0",
      ),
      (payload, status = 200) =>
        new Response(JSON.stringify(payload), { status }),
    );

    assert.ok(response);
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
