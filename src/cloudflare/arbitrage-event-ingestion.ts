/**
 * @file arbitrage-event-ingestion.ts
 * @path src/cloudflare/arbitrage-event-ingestion.ts
 * @description Adapta eventos P2P de webhook y reconciliación al histórico.
 * @module cloudflare
 * @status active
 */

import {
  normalizeMarketEvent,
  type NormalizedMarketEvent,
  type RawMarketEvent,
} from "../backend/arbitrage-market-history.js";
import { appendMarketEvents, type D1Database } from "./d1.js";
import {
  qvapay,
  readQvaPayPayload,
  type QvaPayHttpEnv,
} from "./qvapay-http.js";
import {
  parseQvaPayP2PCollection,
  type QvaPayRecord,
} from "./qvapay-contracts.js";

const MAX_OPERATION_PAGES = 100;
const MAX_PAGE_SIZE = 100;
const FEED_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

interface FeedEnvelope {
  event?: unknown;
  sent_at?: unknown;
  data?: unknown;
}

interface ReconciliationResult {
  fetched: number;
  stored: number;
  unsupported: number;
  pagesFetched: number;
  truncated: boolean;
}

function record(value: unknown): QvaPayRecord | null {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as QvaPayRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestampValue(value: unknown): string | null {
  return stringValue(value);
}

function feedRawEvent(
  envelope: FeedEnvelope,
  source: "webhook" | "stream",
  observedAt: string,
): RawMarketEvent | null {
  const data = record(envelope.data);
  const eventName = stringValue(envelope.event);
  if (!data || !eventName) return null;

  const uuid = stringValue(data.uuid);
  const sentAt = timestampValue(envelope.sent_at);
  const updatedAt = timestampValue(data.updated_at);
  if (!uuid) return null;

  return {
    eventId: `${eventName}:${uuid}`,
    offerUuid: uuid,
    event: eventName,
    status: data.status,
    type: data.type,
    coin: data.coin,
    amount: data.amount,
    availableAmount: data.available_amount,
    receive: data.receive,
    createdAt: data.created_at,
    updatedAt,
    eventAt: sentAt ?? updatedAt,
    observedAt,
    source,
  };
}

function reconciliationEvent(
  operation: QvaPayRecord,
  observedAt: string,
): RawMarketEvent | null {
  const uuid = stringValue(operation.uuid ?? operation.id);
  const status = stringValue(operation.status)?.toLowerCase();
  if (!uuid || !status) return null;

  const eventByStatus: Record<string, string> = {
    open: "created",
    processing: "applied",
    paid: "paid",
    completed: "completed",
    cancelled: "cancelled",
  };
  const event = eventByStatus[status];
  if (!event) return null;

  return {
    eventId: `${event}:${uuid}`,
    offerUuid: uuid,
    event,
    status,
    type: operation.type,
    coin: operation.coin,
    amount: operation.amount,
    availableAmount: operation.available_amount,
    receive: operation.receive,
    createdAt: operation.created_at,
    updatedAt: operation.updated_at,
    eventAt: operation.updated_at ?? operation.created_at,
    observedAt,
    source: "reconciliation",
  };
}

function hexToBytes(value: string): Uint8Array | null {
  const normalized = value.replace(/^sha256=/i, "").trim();
  if (!/^[0-9a-f]{64}$/i.test(normalized)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(
      normalized.slice(index * 2, index * 2 + 2),
      16,
    );
  }
  return bytes;
}

async function verifyFeedSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!signature || !timestamp || !secret) return false;
  const timestampSeconds = Number(timestamp);
  if (
    !Number.isInteger(timestampSeconds) ||
    Math.abs(now - timestampSeconds * 1000) > FEED_TIMESTAMP_WINDOW_MS
  ) {
    return false;
  }

  const provided = hexToBytes(signature);
  if (!provided) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)),
  );
  if (expected.length !== provided.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index]! ^ provided[index]!;
  }
  return difference === 0;
}

/**
 * Procesa un webhook firmado y persiste el evento de forma idempotente.
 */
export async function ingestArbitrageWebhook(
  request: Request,
  db: D1Database,
  feedSecret: string | undefined,
): Promise<Response> {
  const rawBody = await request.text();
  const valid = await verifyFeedSignature(
    rawBody,
    request.headers.get("x-qvapay-signature"),
    request.headers.get("x-qvapay-timestamp"),
    feedSecret,
  );
  if (!valid) {
    return new Response(JSON.stringify({ error: "Firma de feed inválida." }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  let payload: FeedEnvelope;
  try {
    payload = JSON.parse(rawBody) as FeedEnvelope;
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido." }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const normalized = normalizeMarketEvent(
    feedRawEvent(payload, "webhook", new Date().toISOString()) ?? {
      source: "webhook",
    },
  );
  if (!normalized) {
    return new Response(
      JSON.stringify({ error: "Evento P2P no compatible." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  await appendMarketEvents(db, [normalized]);
  return new Response(JSON.stringify({ accepted: true }), {
    status: 202,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Reconcilia operaciones propias mediante el historial paginado de QvaPay.
 * No ejecuta mutaciones y omite estados que no tienen evento soportado.
 */
export async function reconcileArbitrageHistory(
  env: QvaPayHttpEnv & { DB: D1Database },
  now = new Date(),
): Promise<ReconciliationResult> {
  const events: NormalizedMarketEvent[] = [];
  let fetched = 0;
  let unsupported = 0;
  let pagesFetched = 0;
  let lastPage = 1;

  for (let page = 1; page <= MAX_OPERATION_PAGES; page += 1) {
    const params = new URLSearchParams({
      my: "1",
      take: String(MAX_PAGE_SIZE),
      page: String(page),
      sortByStatus: "true",
    });
    const upstream = await qvapay(env, "/p2p?" + params);
    const payload = await readQvaPayPayload(upstream);
    if (!upstream.ok) {
      throw new Error("QvaPay API error.");
    }

    const collection = parseQvaPayP2PCollection(
      payload,
      fetched,
      MAX_PAGE_SIZE,
    );
    if (!collection) {
      throw new Error("QvaPay API contract error.");
    }

    fetched += collection.data.length;
    for (const operation of collection.data) {
      const raw = reconciliationEvent(operation, now.toISOString());
      if (!raw) {
        unsupported += 1;
        continue;
      }
      const normalized = normalizeMarketEvent(raw, now);
      if (normalized) events.push(normalized);
    }

    pagesFetched = page;
    lastPage = Math.max(1, Math.ceil(collection.total / collection.perPage));
    if (page >= lastPage || collection.data.length === 0) break;
  }

  const stored = await appendMarketEvents(env.DB, events);
  return {
    fetched,
    stored,
    unsupported,
    pagesFetched,
    truncated: lastPage > MAX_OPERATION_PAGES,
  };
}
