/**
 * @file ai-audit-router.test.ts
 * @path src/tests/ai-audit-router.test.ts
 * @description Verifica que la frontera AI Auditor no hereda la sesión humana y que el resto de APIs sigue protegido.
 * @module tests
 * @status active
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  routeRequest,
  type WorkerEnv,
} from "../cloudflare/cloudflare-router.js";

function env(): WorkerEnv {
  return {
    DB: {
      prepare() {
        throw new Error(
          "D1 no debe ser consultado para una credencial AI Auditor inválida.",
        );
      },
      batch() {
        throw new Error(
          "D1 no debe ser consultado para una credencial AI Auditor inválida.",
        );
      },
    },
    ASSETS: { fetch: async () => new Response("assets") },
    ARBITRAGE_MONITOR: {
      idFromName: () => "global",
      get: () => ({ fetch: async () => new Response("not used") }),
    },
    AI_AUDITOR_TOKEN_HASH:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
}

test("AI Auditor is evaluated before the human session boundary", async () => {
  const response = await routeRequest(
    new Request("https://example.test/api/ai-audit/health"),
    env(),
  );

  assert.equal(response?.status, 401);
  assert.match(await response!.text(), /Autenticación requerida/);
});

test("non-auditor private APIs still require the human session", async () => {
  const response = await routeRequest(
    new Request("https://example.test/api/arbitrage/monitor"),
    env(),
  );

  assert.equal(response?.status, 401);
});
