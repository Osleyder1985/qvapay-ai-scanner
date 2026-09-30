/**
 * @file index.ts
 * @path src/worker/index.ts
 * @description Cloudflare Worker entrypoint for QvaPay AI Scanner.
 * @module worker
 * @status migration
 *
 * Este Worker es una frontera mínima durante la migración. El runtime Node
 * existente permanece activo hasta que la aceptación de producción sea
 * completada.
 */

export interface WorkerEnv {
  DB: D1Database;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        service: "qvapay-ai-scanner",
        runtime: "cloudflare-worker",
        status: "ok",
      });
    }

    if (request.method === "GET" && url.pathname === "/api/cloudflare/d1/health") {
      const row = await env.DB
        .prepare("SELECT 1 AS ok")
        .first<{ ok: number }>();

      return json({
        service: "qvapay-ai-scanner",
        d1: row?.ok === 1 ? "ok" : "error",
      }, row?.ok === 1 ? 200 : 503);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<WorkerEnv>;
