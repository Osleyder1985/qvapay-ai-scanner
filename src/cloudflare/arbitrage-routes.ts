/**
 * @file arbitrage-routes.ts
 * @path src/cloudflare/arbitrage-routes.ts
 * @description Ruta de escaneo de arbitraje en modo exclusivamente de lectura.
 * @module cloudflare
 * @status active
 */

import { scanArbitrage, type RawArbitrageOffer } from "../backend/arbitrage-market.js";
import {
  parseQvaPayP2PCollection,
  type QvaPayRecord,
} from "./qvapay-contracts.js";
import { qvapay, readQvaPayPayload, type QvaPayHttpEnv } from "./qvapay-http.js";
import type { D1Database } from "./d1.js";

interface ArbitrageEnv extends QvaPayHttpEnv {
  DB: D1Database;
}

type Json = (payload: unknown, status?: number) => Response;

const MAX_PAGE_SIZE = 100;
const MAX_MARKET_PAGES = 10;

function records(payload: unknown): QvaPayRecord[] {
  return parseQvaPayP2PCollection(payload, 0, MAX_PAGE_SIZE)?.data ?? [];
}

function pagination(
  payload: unknown,
  fallback: number,
): { total: number; perPage: number } {
  const contract = parseQvaPayP2PCollection(payload, fallback, MAX_PAGE_SIZE);
  return contract
    ? { total: contract.total, perPage: contract.perPage }
    : { total: fallback, perPage: MAX_PAGE_SIZE };
}

function marketQuery(url: URL): URLSearchParams {
  const params = new URLSearchParams();
  const coin = url.searchParams.get("coin")?.trim().toUpperCase();
  const take = Number(url.searchParams.get("take") ?? MAX_PAGE_SIZE);

  params.set(
    "take",
    String(
      Number.isFinite(take)
        ? Math.min(Math.max(Math.trunc(take), 1), MAX_PAGE_SIZE)
        : MAX_PAGE_SIZE,
    ),
  );
  params.set("status", url.searchParams.get("status")?.trim() || "open");
  if (coin) params.set("coin", coin);
  return params;
}

function toRawOffers(offers: QvaPayRecord[]): RawArbitrageOffer[] {
  return offers.map((offer) => ({
    uuid: offer.uuid,
    type: offer.type,
    coin: offer.coin,
    amount: offer.amount,
    available_amount: offer.available_amount,
    receive: offer.receive,
    offer_kind: offer.offer_kind,
    order_min: offer.order_min,
    order_max: offer.order_max,
    updated_at: offer.updated_at,
    created_at: offer.created_at,
  }));
}

function errorStatus(error: unknown): number {
  return error instanceof Error && error.message === "QVAPAY_CONFIG_MISSING"
    ? 503
    : 502;
}

/**
 * Executes the read-only arbitrage scan against the authenticated QvaPay market.
 */
export async function handleArbitrageRoutes(
  request: Request,
  env: ArbitrageEnv,
  url: URL,
  json: Json,
): Promise<Response | null> {
  if (request.method !== "GET" || url.pathname !== "/api/arbitrage/scan") {
    return null;
  }

  const maxCapitalFiat = Number(url.searchParams.get("maxCapitalFiat") ?? "1000");
  const maxAgeMs = Number(url.searchParams.get("maxAgeMs") ?? "30000");

  if (!Number.isFinite(maxCapitalFiat) || maxCapitalFiat <= 0) {
    return json({ error: "maxCapitalFiat debe ser un número positivo." }, 400);
  }
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    return json({ error: "maxAgeMs debe ser un número no negativo." }, 400);
  }

  try {
    const base = marketQuery(url);
    const offers: QvaPayRecord[] = [];
    let total = 0;
    let lastPage = 1;

    for (let page = 1; page <= MAX_MARKET_PAGES; page += 1) {
      const params = new URLSearchParams(base);
      params.set("page", String(page));

      const upstream = await qvapay(env, "/p2p?" + params.toString());
      const payload = await readQvaPayPayload(upstream);

      if (!upstream.ok) {
        return json(
          { error: "QvaPay API error.", upstreamStatus: upstream.status },
          upstream.status,
        );
      }

      const pageRecords = records(payload);
      if (!parseQvaPayP2PCollection(payload, 0, MAX_PAGE_SIZE)) {
        return json({ error: "Respuesta P2P incompatible con el contrato." }, 502);
      }

      offers.push(...pageRecords);

      const meta = pagination(payload, offers.length);
      total = meta.total;
      lastPage = Math.max(1, Math.ceil(meta.total / meta.perPage));

      if (page >= lastPage || pageRecords.length === 0) break;
    }

    const result = scanArbitrage(toRawOffers(offers), {
      maxCapitalFiat,
      maxAgeMs,
    });

    return json({
      mode: "read-only",
      executionEnabled: false,
      capitalLimitFiat: maxCapitalFiat,
      maxAgeMs,
      coin: base.get("coin") ?? "",
      opportunities: result.opportunities,
      rejected: result.rejected,
      coverage: {
        fetched: offers.length,
        total,
        pagesFetched: Math.min(lastPage, MAX_MARKET_PAGES),
        truncated: lastPage > MAX_MARKET_PAGES,
      },
    });
  } catch (error) {
    return json(
      { error: "No se pudo completar el escaneo de arbitraje." },
      errorStatus(error),
    );
  }
}
