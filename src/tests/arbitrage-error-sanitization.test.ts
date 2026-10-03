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
  const url = new URL("https://example.workers.dev");
  url.pathname = "/api/arbitrage/scan";
  url.searchParams.set("minMarginPercent", "5");

  globalThis.fetch = async () => {
    throw new Error("QVAPAY_INTERNAL_SECRET_OR_TOKEN");
  };

  try {
    const response = await handleArbitrageRoutes(
      new Request(url),
      {
        DB: {} as never,
        QVAPAY_APP_ID: "test-app",
        QVAPAY_APP_SECRET: "test-secret",
      },
      url,
      (payload, status = 200) =>
        new Response(JSON.stringify(payload), { status }),
    );

    assert.ok(response);
    assert.equal(response.status, 502);

    const body = (await response.json()) as Record<string, unknown>;
    const publicError = "No se pudo completar el escaneo de arbitraje.";

    assert.equal(body.error, publicError);
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
