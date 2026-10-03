/**
 * @file diagnostics-routes.ts
 * @path src/cloudflare/diagnostics-routes.ts
 * @description Rutas de diagnóstico y estado de infraestructura Cloudflare.
 * @module cloudflare
 * @status active
 */

import { d1Health, type D1Database } from "./d1.js";
import { logInternalError, publicError } from "./error-contract.js";

type JsonResponse = (payload: unknown, status?: number) => Response;

export async function handleDiagnosticsRoutes(
  request: Request,
  env: { DB: D1Database },
  url: URL,
  json: JsonResponse,
): Promise<Response | null> {
  if (
    request.method === "GET" &&
    url.pathname === "/api/cloudflare/d1/health"
  ) {
    try {
      return json(await d1Health(env.DB));
    } catch (error) {
      logInternalError("diagnostics.d1_health_failed", "D1_UNAVAILABLE");
      return json({ ok: false, ...publicError("D1_UNAVAILABLE") }, 503);
    }
  }

  return null;
}
