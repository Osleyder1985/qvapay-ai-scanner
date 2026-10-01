import {
  appendMarketHistory,
  d1Health,
  listFinanceEntries,
  listOperationIds,
  queryMarketHistory,
  recordFinanceSettlement,
  upsertFinanceEntries,
  upsertOperations,
  type D1Database,
  type FinanceLedgerEntry,
  type MarketHistoryPoint,
} from "./cloudflare/d1.js";
import { calculateFinanceSummary } from "./backend/finance.js";
import { summarizeTrends } from "./backend/trend-engine.js";
import { calculateBaselines } from "./backend/market-baseline.js";
import { parseQvaPayApplicationIdentity } from "./cloudflare/qvapay-identity.js";
import { evaluateQvaPayAccountContract } from "./cloudflare/qvapay-account-contract.js";
import { qvapay, readQvaPayPayload } from "./cloudflare/qvapay-http.js";
import { handleAuthRoutes } from "./cloudflare/auth-routes.js";
import { requireSession, type SessionDatabase } from "./cloudflare/access.js";
import { handleFinanceRoutes } from "./cloudflare/finance-routes.js";
import { handleOperationsRoutes } from "./cloudflare/operations-routes.js";
import { handleAccountRoutes } from "./cloudflare/account-routes.js";


/**
 * @file worker.ts
 * @path src/worker.ts
 * @description Cloudflare Worker entrypoint for QvaPay AI Scanner.
 * @module cloudflare
 * @status active
 * @balance-contract Supports only the documented { balance: number } response.
 *
 * The legacy Node runtime remains available through src/backend/server.ts for
 * local development. This entrypoint adapts the dashboard API to the
 * request/response model used by Cloudflare Workers and serves the existing
 * frontend through Workers Static Assets.
 */

interface WorkerEnv {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  QVAPAY_API_BASE_URL?: string;
  QVAPAY_APP_ID?: string;
  QVAPAY_APP_SECRET?: string;
  AUTH_USERNAME?: string;
  AUTH_PASSWORD?: string;
}

const MAX_PAGE_SIZE = 100;
const MAX_MARKET_PAGES = 10;
const MAX_OPERATION_PAGES = 100;

type JsonRecord = Record<string, unknown>;

function json(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function requestUrl(request: Request): URL {
  return new URL(request.url);
}

function safeUuid(value: string | undefined): string | null {
  if (!value || value.length > 200) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 1_000_000)
    throw new Error("Cuerpo de solicitud demasiado grande.");
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON inválido.");
  }
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

async function market(
  env: WorkerEnv,
  url: URL,
  overrides: Record<string, string> = {},
): Promise<{ response: Response; payload: unknown }> {
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
): {
  total: number;
  perPage: number;
} {
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

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}


function upstreamMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as JsonRecord;
  for (const key of ["error", "message", "detail", "reason"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
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
        if (user?.kyc) {
          reasons.push("KYC informado");
        }

        const rating = numberValue(user?.rating_avg);
        let score =
          String(offer.status ?? "open").toLowerCase() === "open" ? 25 : 0;
        if (med !== null && med > 0) {
          score += Math.min(40, Math.max(0, (item.rate / med - 1) * 1000));
        }
        if (user?.kyc) {
          score += 15;
        }
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

function errorStatus(error: unknown): number {
  return error instanceof Error && error.message.includes("QVAPAY_")
    ? 500
    : 502;
}

async function handleApi(
  request: Request,
  env: WorkerEnv,
): Promise<Response | null> {
  const url = requestUrl(request);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true, service: "qvapay-ai-scanner-worker" });
  }

  const authResponse = await handleAuthRoutes(
    request,
    {
      DB: env.DB as unknown as SessionDatabase,
      AUTH_USERNAME: env.AUTH_USERNAME,
      AUTH_PASSWORD: env.AUTH_PASSWORD,
    },
    url,
    json,
    readJson,
  );
  if (authResponse) return authResponse;

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

  const accountResponse = await handleAccountRoutes(request, env, url, json);
  if (accountResponse) return accountResponse;

  const operationsResponse = await handleOperationsRoutes(request, env, url, json, readJson);
  if (operationsResponse) return operationsResponse;

  const financeResponse = await handleFinanceRoutes(request, env, url, json);
  if (financeResponse) return financeResponse;

  if (request.method === "GET" && url.pathname === "/api/auto-apply/config") {
    return json({
      config: {
        enabled: false,
        type: "sell",
        coin: "",
        rateMin: null,
        rateMax: null,
        amountMin: null,
        amountMax: null,
        dailyMaxQusd: null,
        maxConcurrent: 1,
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/api/auto-apply/status") {
    return json({
      status: {
        running: false,
        lastScanAt: null,
        lastActionAt: null,
        lastMessage:
          "Auto-Apply permanece desactivado en Cloudflare hasta añadir almacenamiento persistente y un scheduler.",
        dailyDate: new Date().toISOString().slice(0, 10),
        dailyAppliedQusd: 0,
        recentApplyAttempts: [],
        appliedOfferIds: [],
      },
    });
  }

  if (
    (request.method === "PUT" || request.method === "PATCH") &&
    url.pathname === "/api/auto-apply/config"
  ) {
    return json(
      {
        error:
          "Auto-Apply no puede persistir configuración ni ejecutar scans periódicos en esta fase de migración Cloudflare.",
      },
      501,
    );
  }

  return null;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/login") {
      return env.ASSETS.fetch(
        new Request(new URL("/login.html", request.url), request),
      );
    }

    if (url.pathname.startsWith("/api/")) {
      if (
        url.pathname !== "/api/health" &&
        !url.pathname.startsWith("/api/auth/")
      ) {
        const session = await requireSession(
          request,
          env.DB as unknown as SessionDatabase,
        );
        if (!session.ok) return session.response;
      }

      if (
        url.pathname !== "/api/health" &&
        requiresSameOrigin(request) &&
        !isSameOrigin(request)
      ) {
        return json(
          { error: "Las mutaciones sólo aceptan solicitudes same-origin." },
          403,
        );
      }

      try {
        const response = await handleApi(request, env);
        if (response) return response;
      } catch (error) {
        return json({ error: String(error) }, errorStatus(error));
      }
    }

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
