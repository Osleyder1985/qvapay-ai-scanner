/**
 * @file worker.ts
 * @path src/worker.ts
 * @description Entrypoint mínimo del Cloudflare Worker.
 * @module cloudflare
 * @status active
 */

import { requireSession, type SessionDatabase } from "./cloudflare/access.js";
import { bootstrapArbitrageMonitor } from "./cloudflare/arbitrage-monitor-routes.js";
import { ArbitrageMonitor } from "./cloudflare/arbitrage-monitor-do.js";

export { ArbitrageMonitor };
import {
  routeRequest,
  securityHeaders,
  type WorkerEnv,
} from "./cloudflare/cloudflare-router.js";

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async scheduled(_controller: unknown, env: WorkerEnv): Promise<void> {
    await bootstrapArbitrageMonitor(env);
  },

  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/login") {
      const assetRequest = new Request(new URL("/login.html", request.url), {
        method: "GET",
      });
      const assetResponse = await env.ASSETS.fetch(assetRequest);
      return withSecurityHeaders(assetResponse);
    }

    const apiResponse = await routeRequest(request, env);
    if (apiResponse) return withSecurityHeaders(apiResponse);

    if (url.pathname === "/" || url.pathname.endsWith(".html")) {
      const session = await requireSession(
        request,
        env.DB as unknown as SessionDatabase,
      );
      if (!session.ok) {
        return withSecurityHeaders(
          Response.redirect(new URL("/login", request.url), 302),
        );
      }
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResponse);
  },
};
