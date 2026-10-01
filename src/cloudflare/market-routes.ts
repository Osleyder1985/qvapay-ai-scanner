/**
 * @file market-routes.ts
 * @path src/cloudflare/market-routes.ts
 * @description Rutas de mercado, histórico e inteligencia de QvaPay.
 * @module cloudflare
 * @status active
 */

import {
  appendMarketHistory,
  d1Health,
  queryMarketHistory,
  type D1Database,
  type MarketHistoryPoint,
} from "./d1.js";
import { summarizeTrends } from "../backend/trend-engine.js";
import { calculateBaselines } from "../backend/market-baseline.js";
import {
  qvapay,
  readQvaPayPayload,
  type QvaPayHttpEnv,
} from "./qvapay-http.js";

type JsonRecord = Record<string, unknown>;
type JsonResponse = (payload: unknown, status?: number) => Response;

const MAX_PAGE_SIZE = 100;
const MAX_MARKET_PAGES = 10;

interface MarketEnv extends QvaPayHttpEnv {
  DB: D1Database;
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function records(payload: unknown): JsonRecord[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as JsonRecord).data;
  return Array.isArray(data)
    ? data.filter(
        (value): value is JsonRecord =>
          Boolean(value) && typeof value === "object",
      )
    : [];
}

function pagination(
  payload: unknown,
  fallback: number,
): { total: number; perPage: number } {
  if (!payload || typeof payload !== "object") {
    return { total: fallback, perPage: MAX_PAGE_SIZE };
  }
  const record = payload as JsonRecord;
  const total = Number(record.total ?? fallback);
  const perPage = Number(record.per_page ?? MAX_PAGE_SIZE);
  return {
    total: Number.isFinite(total) ? total : fallback,
    perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : MAX_PAGE_SIZE,
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle] ?? null;
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  return lower !== undefined && upper !== undefined
    ? (lower + upper) / 2
    : null;
}

function sanitizeMarketParams(url: URL): URLSearchParams {
  const allowed = new Set([
    "page",
    "take",
    "type",
    "coin",
    "orderBy",
    "orderType",
    "min",
    "max",
    "ratio_min",
    "ratio_max",
    "only_vip",
    "my",
    "status",
  ]);
  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (allowed.has(key) && value) params.set(key, value);
  }
  const take = Number(params.get("take") ?? "100");
  params.set(
    "take",
    String(
      Number.isFinite(take)
        ? Math.min(Math.max(Math.trunc(take), 1), MAX_PAGE_SIZE)
        : MAX_PAGE_SIZE,
    ),
  );
  if (
    params.get("orderBy") === "best_rate" &&
    (!params.get("type") || !params.get("coin"))
  ) {
    params.set("orderBy", "updated_at");
  }
  return params;
}

function summarizeMarketOffers(
  offers: JsonRecord[],
  timestamp = new Date().toISOString(),
): MarketHistoryPoint[] {
  const groups = new Map<
    string,
    { rates: number[]; coin: string; type: string }
  >();
  for (const offer of offers) {
    const amount = numberValue(offer.amount);
    const receive = numberValue(offer.receive);
    if (!(amount > 0) || !(receive >= 0)) continue;
    const coin = String(offer.coin ?? "")
      .trim()
      .toUpperCase();
    const type = String(offer.type ?? "")
      .trim()
      .toLowerCase();
    if (!coin || !type) continue;
    const key = type + "|" + coin;
    const group = groups.get(key) ?? { rates: [], coin, type };
    group.rates.push(receive / amount);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    timestamp,
    coin: group.coin,
    type: group.type,
    samples: group.rates.length,
    minRate: group.rates.length ? Math.min(...group.rates) : null,
    medianRate: median(group.rates),
    maxRate: group.rates.length ? Math.max(...group.rates) : null,
    spread: group.rates.length
      ? Math.max(...group.rates) - Math.min(...group.rates)
      : null,
  }));
}

function intelligence(offers: JsonRecord[]): JsonRecord {
  const groups = new Map<string, JsonRecord[]>();
  for (const offer of offers) {
    const coin =
      String(offer.coin ?? "")
        .trim()
        .toUpperCase() || "SIN_MONEDA";
    const group = groups.get(coin) ?? [];
    group.push(offer);
    groups.set(coin, group);
  }

  const byCoin = [...groups.entries()].map(([coin, items]) => {
    const valid = items
      .map((offer) => {
        const amount = numberValue(offer.amount);
        const receive = numberValue(offer.receive);
        return {
          offer,
          amount,
          receive,
          rate: amount > 0 && receive >= 0 ? receive / amount : NaN,
        };
      })
      .filter((item) => Number.isFinite(item.rate));
    const rates = valid.map((item) => item.rate);
    const med = median(rates);
    const opportunities = valid
      .map((item) => {
        const offer = item.offer;
        const reasons: string[] = [];
        if (med !== null && item.rate > med) {
          reasons.push("Tasa por encima de la mediana de esta moneda");
        }
        if (String(offer.status ?? "open").toLowerCase() === "open") {
          reasons.push("Oferta abierta");
        }
        const user =
          offer.User && typeof offer.User === "object"
            ? (offer.User as JsonRecord)
            : null;
        if (user?.kyc) reasons.push("KYC informado");
        const rating = numberValue(user?.rating_avg);
        let score =
          String(offer.status ?? "open").toLowerCase() === "open" ? 25 : 0;
        if (med !== null && med > 0) {
          score += Math.min(40, Math.max(0, (item.rate / med - 1) * 1000));
        }
        if (user?.kyc) score += 15;
        if (Number.isFinite(rating) && rating > 0) {
          score += Math.min(20, rating * 4);
        }
        return {
          uuid: String(offer.uuid ?? offer.id ?? ""),
          type: String(offer.type ?? ""),
          coin,
          amount: item.amount,
          receive: item.receive,
          rate: item.rate,
          score: Math.round(Math.min(100, score)),
          reasons,
        };
      })
      .filter((item) => item.uuid)
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 10);

    return {
      coin,
      sampleSize: items.length,
      validRates: rates.length,
      bestRate: rates.length ? Math.max(...rates) : null,
      medianRate: med,
      minRate: rates.length ? Math.min(...rates) : null,
      maxRate: rates.length ? Math.max(...rates) : null,
      spread: rates.length ? Math.max(...rates) - Math.min(...rates) : null,
      sellCount: items.filter(
        (item) => String(item.type).toLowerCase() === "sell",
      ).length,
      buyCount: items.filter(
        (item) => String(item.type).toLowerCase() === "buy",
      ).length,
      openCount: items.filter(
        (item) => String(item.status ?? "open").toLowerCase() === "open",
      ).length,
      opportunities,
    };
  });

  const allValid = offers
    .map((offer) => {
      const amount = numberValue(offer.amount);
      const receive = numberValue(offer.receive);
      return amount > 0 && receive >= 0 ? receive / amount : NaN;
    })
    .filter(Number.isFinite);

  return {
    sampleSize: offers.length,
    validRates: allValid.length,
    bestRate: allValid.length ? Math.max(...allValid) : null,
    medianRate: median(allValid),
    minRate: allValid.length ? Math.min(...allValid) : null,
    maxRate: allValid.length ? Math.max(...allValid) : null,
    spread: allValid.length
      ? Math.max(...allValid) - Math.min(...allValid)
      : null,
    sellCount: offers.filter(
      (offer) => String(offer.type).toLowerCase() === "sell",
    ).length,
    buyCount: offers.filter(
      (offer) => String(offer.type).toLowerCase() === "buy",
    ).length,
    coins: byCoin.map((item) => item.coin),
    opportunities: byCoin
      .flatMap((item) => (item.opportunities as JsonRecord[]) ?? [])
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 10),
    byCoin,
  };
}

async function market(
  env: MarketEnv,
  url: URL,
  overrides: Record<string, string> = {},
) {
  const params = sanitizeMarketParams(url);
  Object.entries(overrides).forEach(([key, value]) => params.set(key, value));
  const upstream = await qvapay(env, "/p2p?" + params.toString());
  const payload = await readQvaPayPayload(upstream);
  if (upstream.ok && params.get("page") === "1") {
    try {
      await appendMarketHistory(
        env.DB,
        summarizeMarketOffers(records(payload)),
      );
    } catch (error) {
      console.error("D1 market history persistence:", error);
    }
  }
  return { response: upstream, payload };
}

/**
 * Atiende las rutas de mercado, histórico, tendencias, líneas base e inteligencia.
 */
export async function handleMarketRoutes(
  request: Request,
  env: MarketEnv,
  url: URL,
  json: JsonResponse,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/api/market/snapshot") {
    try {
      const health = await d1Health(env.DB);
      return json({
        marketSnapshot: {
          persistence: health.ok ? "d1" : "unavailable",
          tables: health.tables,
        },
      });
    } catch (error) {
      return json(
        {
          error: "No se pudo consultar el estado de D1",
          detail: String(error),
        },
        503,
      );
    }
  }

  if (request.method === "GET" && url.pathname === "/api/history") {
    try {
      const coin = url.searchParams.get("coin") ?? undefined;
      const type = url.searchParams.get("type") ?? undefined;
      const limit = Number(url.searchParams.get("limit") ?? "200");
      return json({
        history: await queryMarketHistory(
          env.DB,
          coin,
          type,
          Number.isFinite(limit) ? limit : 200,
        ),
      });
    } catch (error) {
      return json(
        {
          error: "No se pudo consultar el histórico de mercado",
          detail: String(error),
        },
        503,
      );
    }
  }

  if (request.method === "GET" && url.pathname === "/api/trends") {
    try {
      const coin = url.searchParams.get("coin") ?? undefined;
      const type = url.searchParams.get("type") ?? undefined;
      const points = await queryMarketHistory(env.DB, coin, type, 1000);
      return json({ trends: summarizeTrends(points) });
    } catch (error) {
      return json(
        {
          error: "No se pudieron calcular las tendencias",
          detail: String(error),
        },
        503,
      );
    }
  }

  if (request.method === "GET" && url.pathname === "/api/baselines") {
    try {
      const coin = url.searchParams.get("coin") ?? undefined;
      const type = url.searchParams.get("type") ?? undefined;
      const lookback = Number(url.searchParams.get("lookback") ?? "24");
      const points = await queryMarketHistory(env.DB, coin, type, 1000);
      return json({
        baselines: calculateBaselines(
          points,
          Number.isFinite(lookback) ? lookback : 24,
        ),
      });
    } catch (error) {
      return json(
        {
          error: "No se pudieron calcular las líneas base",
          detail: String(error),
        },
        503,
      );
    }
  }

  if (url.pathname === "/api/p2p" && request.method === "GET") {
    try {
      const result = await market(env, url);
      return json(
        result.response.ok
          ? result.payload
          : { error: "QvaPay API error", detail: result.payload },
        result.response.status,
      );
    } catch (error) {
      return json(
        { error: "No se pudo contactar con QvaPay", detail: String(error) },
        errorStatus(error),
      );
    }
  }

  if (url.pathname === "/api/intelligence" && request.method === "GET") {
    try {
      const base = sanitizeMarketParams(url);
      base.set("page", "1");
      base.set("take", String(MAX_PAGE_SIZE));
      const offers: JsonRecord[] = [];
      let total = 0;
      let lastPage = 1;
      for (let page = 1; page <= MAX_MARKET_PAGES; page += 1) {
        const pageUrl = new URL(url);
        pageUrl.search = base.toString();
        pageUrl.searchParams.set("page", String(page));
        const result = await market(env, pageUrl);
        if (!result.response.ok) {
          return json(
            { error: "QvaPay API error", detail: result.payload },
            result.response.status,
          );
        }
        offers.push(...records(result.payload));
        const meta = pagination(result.payload, offers.length);
        total = meta.total;
        lastPage = Math.max(1, Math.ceil(meta.total / meta.perPage));
        if (page >= lastPage || !records(result.payload).length) break;
      }
      return json({
        intelligence: intelligence(offers),
        coverage: {
          total,
          pagesFetched: Math.min(lastPage, MAX_MARKET_PAGES),
          truncated: lastPage > MAX_MARKET_PAGES,
        },
      });
    } catch (error) {
      return json({ error: String(error) }, errorStatus(error));
    }
  }

  return null;
}

function errorStatus(error: unknown): number {
  return error instanceof Error && error.message.includes("QVAPAY_")
    ? 500
    : 502;
}
