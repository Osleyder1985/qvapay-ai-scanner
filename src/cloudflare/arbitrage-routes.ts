/**
 * @file arbitrage-routes.ts
 * @path src/cloudflare/arbitrage-routes.ts
 * @description Ruta de escaneo de arbitraje en modo exclusivamente de lectura.
 * @module cloudflare
 * @status active
 */

import {
  scanArbitrage,
  type RawArbitrageOffer,
} from "../backend/arbitrage-market.js";
import {
  parseQvaPayP2PCollection,
  type QvaPayRecord,
} from "./qvapay-contracts.js";
import {
  qvapay,
  readQvaPayPayload,
  type QvaPayHttpEnv,
} from "./qvapay-http.js";
import type { D1Database } from "./d1.js";

interface ArbitrageEnv extends QvaPayHttpEnv {
  DB: D1Database;
}

type Json = (payload: unknown, status?: number) => Response;

const MAX_PAGE_SIZE = 100;
const MAX_MARKET_PAGES = 3;

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
  // Keep both sides of the selected coin: SELL offers are the acquisition
  // market, while BUY offers are required to calculate real arbitrage pairs.
  // The monitor is capped at three pages per 10-second cycle to stay below
  // QvaPay's documented market-request budget.
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

export async function runArbitrageMonitorRoute(
  env: ArbitrageEnv,
  minMarginPercent: number,
  coin: string,
): Promise<Response> {
  const request = new Request(
    `https://internal/api/arbitrage/scan?minMarginPercent=${encodeURIComponent(minMarginPercent)}&coin=${encodeURIComponent(coin)}`,
  );
  return (
    (await handleArbitrageRoutes(
      request,
      env,
      new URL(request.url),
      jsonResponse,
    )) ??
    new Response(JSON.stringify({ error: "ARBITRAGE_ROUTE_NOT_FOUND" }), {
      status: 500,
    })
  );
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function handleArbitrageRoutes(
  request: Request,
  env: ArbitrageEnv,
  url: URL,
  json: Json,
): Promise<Response | null> {
  if (request.method !== "GET" || url.pathname !== "/api/arbitrage/scan") {
    return null;
  }

  const minMarginPercent = Number(
    url.searchParams.get("minMarginPercent") ?? "5",
  );

  if (!Number.isFinite(minMarginPercent) || minMarginPercent < 0) {
    return json(
      { error: "minMarginPercent debe ser un número no negativo." },
      400,
    );
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
        const upstreamError =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : {};
        const detail =
          typeof upstreamError.message === "string"
            ? upstreamError.message
            : typeof upstreamError.msg === "string"
              ? upstreamError.msg
              : typeof upstreamError.error === "string"
                ? upstreamError.error
                : undefined;
        return json(
          {
            error: "QvaPay API error.",
            detail,
            upstreamStatus: upstream.status,
          },
          upstream.status,
        );
      }

      const pageRecords = records(payload);
      if (!parseQvaPayP2PCollection(payload, 0, MAX_PAGE_SIZE)) {
        return json(
          { error: "Respuesta P2P incompatible con el contrato." },
          502,
        );
      }

      offers.push(...pageRecords);

      const meta = pagination(payload, offers.length);
      total = meta.total;
      lastPage = Math.max(1, Math.ceil(meta.total / meta.perPage));

      if (page >= lastPage || pageRecords.length === 0) break;
    }

    const result = scanArbitrage(toRawOffers(offers), {
      minMarginPercent,
    });

    const selectedCoin = (base.get("coin") ?? "").toUpperCase();
    const normalizedMarketOffers = offers
      .filter(
        (offer) =>
          ["sell", "buy"].includes(String(offer.type).toLowerCase()) &&
          (!selectedCoin || String(offer.coin).toUpperCase() === selectedCoin),
      )
      .map((offer) => {
        const type = String(offer.type).toLowerCase();
        const amount = Number(offer.amount);
        const offerKind = String(offer.offer_kind ?? "").toLowerCase();
        const rawAvailable =
          offer.available_amount == null ? NaN : Number(offer.available_amount);
        const available =
          offerKind === "fixed"
            ? amount
            : Number.isFinite(rawAvailable)
              ? rawAvailable
              : amount;
        const receive = Number(offer.receive);
        const rate = amount > 0 ? receive / amount : NaN;
        const quantity =
          Number.isFinite(available) && available > 0 ? available : 0;
        const capital = type === "sell" ? quantity * rate : 0;
        const targetRate =
          type === "sell" ? rate * (1 + minMarginPercent / 100) : null;
        const targetProceeds =
          type === "sell" && targetRate !== null ? quantity * targetRate : null;
        const projectedProfit =
          type === "sell" && targetProceeds !== null
            ? targetProceeds - capital
            : null;
        return {
          uuid: offer.uuid,
          coin: offer.coin,
          type: offer.type,
          amountQusd: amount,
          availableQusd: quantity,
          purchaseRate: rate,
          saleRate: type === "buy" ? rate : null,
          capitalRequiredFiat: capital,
          capitalRequiredQusd: type === "buy" ? quantity : 0,
          targetSaleRate: targetRate,
          targetSaleProceedsFiat: targetProceeds,
          projectedGrossProfitFiat: projectedProfit,
          projectedGrossMarginPercent:
            type === "sell" && capital > 0 && projectedProfit !== null
              ? (projectedProfit / capital) * 100
              : null,
          offerKind: offerKind || null,
          orderMinQusd: offer.order_min ?? null,
          orderMaxQusd: offer.order_max ?? null,
          onlyVip: Boolean(offer.only_vip),
          updatedAt: offer.updated_at ?? offer.created_at ?? null,
        };
      })
      .filter(
        (offer) =>
          Number.isFinite(offer.purchaseRate) && offer.purchaseRate > 0,
      )
      .sort((a, b) => {
        const aRate = Number(a.purchaseRate);
        const bRate = Number(b.purchaseRate);
        if (a.type === "sell" && b.type === "sell") return aRate - bRate;
        if (a.type === "buy" && b.type === "buy") return bRate - aRate;
        return a.type === "sell" ? -1 : 1;
      });
    const marketOffers = normalizedMarketOffers.filter(
      (offer) => String(offer.type).toLowerCase() === "sell",
    );
    const marketBuyOffers = normalizedMarketOffers.filter(
      (offer) => String(offer.type).toLowerCase() === "buy",
    );

    return json({
      mode: "read-only",
      executionEnabled: false,
      minMarginPercent,
      coin: base.get("coin") ?? "",
      opportunities: result.opportunities,
      rejected: result.rejected,
      marketOffers,
      marketBuyOffers,
      marketSimulation: {
        coin: selectedCoin,
        type: "sell",
        minMarginPercent,
        scannedAt: new Date().toISOString(),
      },
      coverage: {
        fetched: offers.length,
        total,
        pagesFetched: Math.min(lastPage, MAX_MARKET_PAGES),
        truncated: lastPage > MAX_MARKET_PAGES,
      },
    });
  } catch (error) {
    return json(
      {
        error: "No se pudo completar el escaneo de arbitraje.",
        code: "ARBITRAGE_SCAN_FAILED",
      },
      errorStatus(error),
    );
  }
}
