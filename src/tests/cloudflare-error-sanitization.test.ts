/**
 * @file cloudflare-error-sanitization.test.ts
 * @path src/tests/cloudflare-error-sanitization.test.ts
 * @description Verifica la frontera entre errores internos y respuestas HTTP públicas.
 * @module tests
 * @status active
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { publicError } from "../cloudflare/error-contract.js";
import { handleDiagnosticsRoutes } from "../cloudflare/diagnostics-routes.js";
import { handleArbitrageMonitorRoutes, sanitizeMonitorError } from "../cloudflare/arbitrage-monitor-routes.js";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("public error contract never serializes internal diagnostics", () => {
  const payload = publicError("INTERNAL_ERROR");
  assert.deepEqual(payload, {
    error: "No se pudo completar la solicitud.",
    code: "INTERNAL_ERROR",
  });
  assert.equal(JSON.stringify(payload).includes("secret"), false);
});

test("D1 failures expose a stable public code instead of the internal exception", async () => {
  const response = await handleDiagnosticsRoutes(
    new Request("https://scanner.example/api/cloudflare/d1/health"),
    {
      DB: {
        prepare() {
          throw new Error("D1 table name or credential detail must not escape");
        },
      } as never,
    },
    new URL("https://scanner.example/api/cloudflare/d1/health"),
    json,
  );

  assert.equal(response?.status, 503);
  const body = (await response?.json()) as Record<string, unknown>;
  assert.equal(body.error, "La base de datos no está disponible.");
  assert.equal(body.code, "D1_UNAVAILABLE");
  assert.equal(JSON.stringify(body).includes("credential"), false);
});

test("monitor configuration failures expose only a stable public code", async () => {
  const response = await handleArbitrageMonitorRoutes(
    new Request("https://scanner.example/api/arbitrage/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coin: "BANK_CUP", minMarginPercent: 5 }),
    }),
    {
      DB: {
        prepare() {
          return {
            bind() {
              return {
                async run() {
                  return { meta: { changes: 0 } };
                },
              };
            },
          };
        },
      } as never,
      ARBITRAGE_MONITOR: {
        idFromName() {
          return "global";
        },
        get() {
          return {
            async fetch() {
              return new Response("ok");
            },
          };
        },
      },
    },
    new URL("https://scanner.example/api/arbitrage/monitor"),
    json,
  );

  assert.equal(response?.status, 503);
  const body = (await response?.json()) as Record<string, unknown>;
  assert.equal(body.error, "La configuración del monitor no está disponible.");
  assert.equal(body.code, "MONITOR_CONFIG_ROW_MISSING");
  assert.equal(JSON.stringify(body).includes("id=1"), false);
});

test("legacy monitor error text is normalized to the public monitor failure code", () => {
  assert.equal(sanitizeMonitorError("database password=secret"), "MONITOR_RUN_FAILED");
  assert.equal(sanitizeMonitorError("MONITOR_RUN_FAILED"), "MONITOR_RUN_FAILED");
  assert.equal(sanitizeMonitorError(null), null);
});
