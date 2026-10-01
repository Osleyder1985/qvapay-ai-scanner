/**
 * @file diagnostics-routes.ts
 * @path src/cloudflare/diagnostics-routes.ts
 * @description Rutas de diagnóstico y estado de infraestructura Cloudflare.
 * @module cloudflare
 * @status active
 */

import { d1Health, type D1Database } from "./d1.js";

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
      return json(
        {
          ok: false,
          error: "D1 no está disponible o no tiene el esquema aplicado.",
          detail: String(error),
        },
        503,
      );
    }
  }

  return null;
}
