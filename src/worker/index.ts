/**
 * @file index.ts
 * @path src/worker/index.ts
 * @description Cloudflare Worker entrypoint for QvaPay AI Scanner.
 * @module worker
 * @status migration
 *
 * El runtime Node existente permanece activo hasta completar la aceptación
 * de producción. Esta frontera expone sólo lecturas D1 internas durante la
 * migración; no ejecuta mutaciones QvaPay.
 */

import {
  D1Repository,
  type D1DatabaseLike,
  type D1FinanceRow,
  type D1OperationRow,
} from "../backend/cloudflare/d1-repository.js";

export interface WorkerEnv {
  DB: D1DatabaseLike;
  DASHBOARD_API_TOKEN?: string;
}

interface WorkerHandler {
  fetch(request: Request, env: WorkerEnv): Promise<Response>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function authorized(request: Request, env: WorkerEnv): boolean {
  const expected = env.DASHBOARD_API_TOKEN?.trim();
  if (!expected) return false;
  const provided = request.headers.get("authorization")?.trim();
  return provided === `Bearer ${expected}`;
}

function operationFromRow(
  row: D1OperationRow | null,
): Record<string, unknown> | null {
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.raw_json);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Fall through to the durable normalized projection below.
  }

  return {
    uuid: row.uuid,
    type: row.type,
    status: row.status,
    amount: row.amount,
    receive: row.receive,
    currentUserId: row.current_user_id,
    User: {
      uuid: row.user_uuid,
      id: row.user_id,
      username: row.user_username,
      name: row.user_name,
    },
    Peer: {
      uuid: row.peer_uuid,
      id: row.peer_id,
      username: row.peer_username,
      name: row.peer_name,
    },
  };
}

function financeFromRow(row: D1FinanceRow): Record<string, unknown> {
  return {
    uuid: row.uuid,
    status: row.status,
    type: row.type,
    coin: row.coin,
    amount: row.amount,
    receive: row.receive,
    created_at: row.created_at,
    updated_at: row.updated_at,
    recorded_at: row.recorded_at,
    gross_amount_qusd: row.gross_amount_qusd,
    fee_qusd: row.fee_qusd,
    net_amount_qusd: row.net_amount_qusd,
    fee_source: row.fee_source,
  };
}

const handler: WorkerHandler = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        service: "qvapay-ai-scanner",
        runtime: "cloudflare-worker",
        status: "ok",
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/cloudflare/d1/health"
    ) {
      try {
        const row = await env.DB.prepare("SELECT 1 AS ok").first<{
          ok: number;
        }>();

        return json(
          {
            service: "qvapay-ai-scanner",
            d1: row?.ok === 1 ? "ok" : "error",
          },
          row?.ok === 1 ? 200 : 503,
        );
      } catch {
        return json(
          {
            service: "qvapay-ai-scanner",
            d1: "error",
          },
          503,
        );
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/cloudflare/d1/operations"
    ) {
      if (!authorized(request, env)) {
        return json({ error: "No autorizado" }, 401);
      }

      const requestedLimit = Number(url.searchParams.get("limit") ?? "100");
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 1000)
        : 100;

      try {
        const repository = new D1Repository(env.DB);
        const rows = await repository.listOperations(limit);
        const operations = rows
          .map(operationFromRow)
          .filter(
            (operation): operation is Record<string, unknown> =>
              operation !== null,
          );

        return json({
          operations: {
            data: operations,
            total: operations.length,
            per_page: limit,
            page: 1,
          },
          source: {
            runtime: "cloudflare-worker",
            persistence: "d1",
            persisted: operations.length,
          },
        });
      } catch {
        return json(
          { error: "No se pudieron leer las operaciones desde D1" },
          503,
        );
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/cloudflare/d1/finance"
    ) {
      if (!authorized(request, env)) {
        return json({ error: "No autorizado" }, 401);
      }

      const uuid = url.searchParams.get("uuid")?.trim();
      if (!uuid) {
        return json({ error: "El parámetro uuid es obligatorio" }, 400);
      }

      try {
        const repository = new D1Repository(env.DB);
        const row = await repository.getFinance(uuid);
        if (!row) {
          return json({ error: "Entrada financiera no encontrada" }, 404);
        }

        return json({
          finance: financeFromRow(row),
          source: {
            runtime: "cloudflare-worker",
            persistence: "d1",
          },
        });
      } catch {
        return json(
          { error: "No se pudo leer el ledger financiero desde D1" },
          503,
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

export default handler;
