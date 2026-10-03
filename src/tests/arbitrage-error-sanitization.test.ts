/**
 * @file arbitrage-error-sanitization.test.ts
 * @path src/tests/arbitrage-error-sanitization.test.ts
 * @description Verifica que los errores internos no crucen la frontera HTTP pública.
 * @module tests
 * @status test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { handleArbitrageRoutes } from "../cloudflare/arbitrage-routes.js";

test("sanitizes internal arbitrage errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("QVAPAY_INTERNAL_SECRET_OR_TOKEN");
  };

  try {
    const url =
      "https://example.workers.dev/api/arbitrage/scan?minMarginPercent=5";
    const response = await handleArbitrageRoutes(
      new Request(url),
      {
        DB: {} as never,
        QVAPAY_APP_ID: "test-app",
        QVAPAY_APP_SECRET: "test-secret",
      },
      new URL(url),
      (payload, status = 200) =>
        new Response(JSON.stringify(payload), { status }),
    );

    assert.ok(response);
    assert.equal(response.status, 502);
    const body = (await response.json()) as {
      error: string;
      code: string;
      detail?: string;
    };
    assert.equal(
      body.error,
      "No se pudo completar el escaneo de arbitraje.",
    );
    assert.equal(body.code, "ARBITRAGE_SCAN_FAILED");
    assert.equal("detail" in body, false);
    assert.equal(
      JSON.stringify(body).includes("QVAPAY_INTERNAL_SECRET_OR_TOKEN"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
