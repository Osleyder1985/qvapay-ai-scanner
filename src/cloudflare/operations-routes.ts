/**
 * @file operations-routes.ts
 * @path src/cloudflare/operations-routes.ts
 * @description Rutas HTTP de operaciones P2P y persistencia de operaciones.
 * @module cloudflare
 * @status active
 */

import {
  listOperationIds,
  recordFinanceSettlement,
  upsertOperations,
  type D1Database,
} from "./d1.js";
import {
  qvapay,
  readQvaPayPayload,
  type QvaPayHttpEnv,
} from "./qvapay-http.js";
import {
  finiteNumber,
  parseQvaPayActionResponse,
  parseQvaPayCollection,
  type QvaPayRecord,
} from "./qvapay-contracts.js";

type JsonRecord = QvaPayRecord;
type JsonResponse = (payload: unknown, status?: number) => Response;
type ReadJson = (request: Request) => Promise<unknown>;

const MAX_PAGE_SIZE = 100;
const MAX_OPERATION_PAGES = 100;

function numberValue(value: unknown): number {
  return finiteNumber(value) ?? NaN;
}

/**
 * Atiende las rutas de operaciones y acciones sobre operaciones/ofertas.
 */
export async function handleOperationsRoutes(
  request: Request,
  env: QvaPayHttpEnv & { DB: D1Database },
  url: URL,
  json: JsonResponse,
  readJson: ReadJson,
): Promise<Response | null> {
  if (url.pathname === "/api/operations" && request.method === "GET") {
    try {
      const operations: JsonRecord[] = [];
      let total = 0;
      let lastPage = 1;

      for (let page = 1; page <= MAX_OPERATION_PAGES; page += 1) {
        const pageUrl = new URL(url);
        pageUrl.search = "";
        pageUrl.searchParams.set("my", "1");
        pageUrl.searchParams.set("take", String(MAX_PAGE_SIZE));
        pageUrl.searchParams.set("page", String(page));
        pageUrl.searchParams.set("sortByStatus", "true");
        const upstream = await qvapay(env, "/p2p?" + pageUrl.searchParams);
        const payload = await readQvaPayPayload(upstream);
        if (!upstream.ok) {
          return json({ error: "QvaPay API error." }, upstream.status);
        }
        const collection = parseQvaPayCollection(
          payload,
          operations.length,
          MAX_PAGE_SIZE,
        );
        if (!collection) {
          return json({ error: "QvaPay API contract error." }, 502);
        }
        operations.push(...collection.data);
        total = collection.total;
        lastPage = Math.max(
          1,
          Math.ceil(collection.total / collection.perPage),
        );
        if (page >= lastPage || collection.data.length === 0) break;
      }

      await upsertOperations(env.DB, operations);
      const ledgerIds = await listOperationIds(env.DB);
      const remoteIds = new Set(
        operations
          .map((operation) =>
            String(operation.uuid ?? operation.id ?? "").trim(),
          )
          .filter(Boolean),
      );
      const localIds = new Set(ledgerIds);

      return json({
        operations: {
          data: operations,
          total,
          per_page: MAX_PAGE_SIZE,
          page: 1,
          pages_fetched: Math.min(lastPage, MAX_OPERATION_PAGES),
          truncated: lastPage > MAX_OPERATION_PAGES,
        },
        source: {
          remoteTotal: total,
          fetched: operations.length,
          pagesFetched: Math.min(lastPage, MAX_OPERATION_PAGES),
          truncated: lastPage > MAX_OPERATION_PAGES,
        },
        persistence: {
          persisted: ledgerIds.length,
          reconciled: [...remoteIds].every((id) => localIds.has(id)),
        },
        reconciliation: {
          remoteCount: remoteIds.size,
          ledgerCount: localIds.size,
          missingInLedger: [...remoteIds].filter((id) => !localIds.has(id)),
          staleLocal: [...localIds].filter((id) => !remoteIds.has(id)),
        },
      });
    } catch (error) {
      return json(
        { error: "No se pudo completar la solicitud." },
        errorStatus(error),
      );
    }
  }

  const offerMatch = url.pathname.match(/^\/api\/p2p\/([^/]+)$/);
  if (request.method === "GET" && offerMatch?.[1]) {
    const uuid = safeUuid(offerMatch[1]);
    if (!uuid) {
      return json({ error: "Identificador de oferta inválido." }, 400);
    }
    try {
      const upstream = await qvapay(env, "/p2p/" + encodeURIComponent(uuid));
      const payload = await readQvaPayPayload(upstream);
      if (!upstream.ok) {
        return json(
          { error: "No se pudo consultar la oferta." },
          upstream.status,
        );
      }
      const contract = parseQvaPayActionResponse(payload);
      if (!contract) return json({ error: "QvaPay API contract error." }, 502);
      return json({ offer_uuid: uuid, qvapay: contract.payload });
    } catch (error) {
      return json(
        { error: "No se pudo completar la solicitud." },
        errorStatus(error),
      );
    }
  }

  const operationMatch = url.pathname.match(
    /^\/api\/operations\/([^/]+)\/(paid|received|cancel|chat|rate)$/,
  );
  if (request.method === "POST" && operationMatch?.[1] && operationMatch[2]) {
    const uuid = safeUuid(operationMatch[1]);
    if (!uuid) {
      return json({ error: "Identificador de operación inválido." }, 400);
    }
    try {
      const action = operationMatch[2];
      const body =
        action === "paid" || action === "chat" || action === "rate"
          ? await readJson(request)
          : undefined;

      if (action === "paid") {
        const txId =
          body && typeof body === "object"
            ? String((body as JsonRecord).tx_id ?? "").trim()
            : "";
        if (!txId || txId.length > 500) {
          return json(
            {
              error:
                "tx_id es obligatorio y debe tener como máximo 500 caracteres.",
            },
            400,
          );
        }
      }
      if (action === "chat") {
        const message =
          body && typeof body === "object"
            ? String((body as JsonRecord).message ?? "").trim()
            : "";
        if (!message || message.length > 599) {
          return json(
            { error: "El mensaje debe tener entre 1 y 599 caracteres." },
            400,
          );
        }
      }
      if (action === "rate") {
        const rating =
          body && typeof body === "object"
            ? numberValue((body as JsonRecord).rating)
            : NaN;
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
          return json(
            { error: "La calificación debe estar entre 1 y 5." },
            400,
          );
        }
        const comment =
          body && typeof body === "object"
            ? String((body as JsonRecord).comment ?? "")
            : "";
        if (comment.length > 120) {
          return json(
            { error: "El comentario no puede superar 120 caracteres." },
            400,
          );
        }
      }

      const headers: Record<string, string> = {};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const upstream = await qvapay(
        env,
        "/p2p/" + encodeURIComponent(uuid) + "/" + action,
        {
          method: "POST",
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
      const payload = await readQvaPayPayload(upstream);
      if (!upstream.ok) {
        return json({ error: "QvaPay API error." }, upstream.status);
      }
      const contract = parseQvaPayActionResponse(payload);
      if (!contract) return json({ error: "QvaPay API contract error." }, 502);

      if (action === "received") {
        try {
          await recordFinanceSettlement(env.DB, uuid, contract.payload);
        } catch (error) {
          console.error("D1 finance settlement persistence:", error);
        }
      }

      return json({
        ok: true,
        action,
        offer_uuid: uuid,
        qvapay: contract.payload,
      });
    } catch (error) {
      return json(
        { error: "No se pudo completar la solicitud." },
        errorStatus(error),
      );
    }
  }

  const chatMatch = url.pathname.match(/^\/api\/operations\/([^/]+)\/chat$/);
  if (request.method === "GET" && chatMatch?.[1]) {
    const uuid = safeUuid(chatMatch[1]);
    if (!uuid) {
      return json({ error: "Identificador de operación inválido." }, 400);
    }
    try {
      const upstream = await qvapay(
        env,
        "/p2p/" + encodeURIComponent(uuid) + "/chat",
        { method: "GET" },
      );
      const payload = await readQvaPayPayload(upstream);
      if (!upstream.ok) {
        return json({ error: "QvaPay API error." }, upstream.status);
      }
      const contract = parseQvaPayActionResponse(payload);
      if (!contract) return json({ error: "QvaPay API contract error." }, 502);
      return json({ qvapay: contract.payload });
    } catch (error) {
      return json(
        { error: "No se pudo completar la solicitud." },
        errorStatus(error),
      );
    }
  }

  if (
    request.method === "POST" &&
    /^\/api\/p2p\/[^/]+\/apply$/.test(url.pathname)
  ) {
    const match = url.pathname.match(/^\/api\/p2p\/([^/]+)\/apply$/);
    const uuid = safeUuid(match?.[1]);
    if (!uuid) {
      return json({ error: "Identificador de oferta inválido." }, 400);
    }
    try {
      const upstream = await qvapay(
        env,
        "/p2p/" + encodeURIComponent(uuid) + "/apply",
        { method: "POST" },
      );
      const payload = await readQvaPayPayload(upstream);
      if (!upstream.ok) {
        return json(
          { error: "No se pudo aplicar a la oferta." },
          upstream.status,
        );
      }
      const contract = parseQvaPayActionResponse(payload);
      if (!contract) return json({ error: "QvaPay API contract error." }, 502);
      return json({
        applied: true,
        offer_uuid: uuid,
        qvapay: contract.payload,
      });
    } catch (error) {
      return json(
        { error: "No se pudo completar la solicitud." },
        errorStatus(error),
      );
    }
  }

  return null;
}

function safeUuid(value: string | undefined): string | null {
  if (!value || value.length > 200) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function errorStatus(error: unknown): number {
  return error instanceof Error && error.message.includes("QVAPAY_")
    ? 500
    : 502;
}
