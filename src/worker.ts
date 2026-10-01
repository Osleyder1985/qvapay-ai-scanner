/**
 * @file worker.ts
 * @path src/worker.ts
 * @description Entrypoint mínimo del Cloudflare Worker.
 * @module cloudflare
 * @status active
 */

import { requireSession, type SessionDatabase } from "./cloudflare/access.js";
import {
  routeRequest,
  type WorkerEnv,
} from "./cloudflare/cloudflare-router.js";

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/login") {
      return env.ASSETS.fetch(
        new Request(new URL("/login.html", request.url), request),
      );
    }

    const apiResponse = await routeRequest(request, env);
    if (apiResponse) return apiResponse;

    if (url.pathname === "/" || url.pathname.endsWith(".html")) {
      const session = await requireSession(
        request,
        env.DB as unknown as SessionDatabase,
      );
      if (!session.ok) {
        return Response.redirect(new URL("/login", request.url), 302);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
