/**
 * @file market-history.ts
 * @path src/backend/market-history.ts
 * @description Implements market history for QvaPay AI Scanner.
 * @module backend
 * @status active
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**

 * Public interface MarketHistoryPoint used by the module.

 */

export interface MarketHistoryPoint {
  timestamp: string;
  coin: string;
  type: string;
  samples: number;
  minRate: number | null;
  medianRate: number | null;
  maxRate: number | null;
  spread: number | null;
}

/**

 * Public interface MarketHistoryStoreOptions used by the module.

 */

export interface MarketHistoryStoreOptions {
  path?: string;
  maxPoints?: number;
}

interface Offer {
  type?: unknown;
  coin?: unknown;
  amount?: unknown;
  receive?: unknown;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
const median = (a: number[]): number | null => {
  if (!a.length) return null;
  const x = [...a].sort((p, q) => p - q),
    m = Math.floor(x.length / 2),
    lower = x[m - 1],
    upper = x[m];
  return x.length % 2
    ? (upper ?? null)
    : lower !== undefined && upper !== undefined
      ? (lower + upper) / 2
      : null;
};

/**
 * Implements the summarizeMarket operation for this module.
 * @param offers Input used by the operation.
 * @param timestamp Input used by the operation.
 * @returns The operation result.
 */
export function summarizeMarket(
  offers: Offer[],
  timestamp = new Date().toISOString(),
): MarketHistoryPoint[] {
  const groups = new Map<
    string,
    { rates: number[]; coin: string; type: string }
  >();
  for (const offer of offers) {
    const amount = n(offer.amount),
      receive = n(offer.receive);
    if (!(amount > 0) || !(receive >= 0)) continue;
    const coin = String(offer.coin ?? "").toUpperCase();
    const type = String(offer.type ?? "").toLowerCase();
    if (!coin || !type) continue;
    const key = type + "|" + coin;
    const group = groups.get(key) ?? { rates: [], coin, type };
    group.rates.push(receive / amount);
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => {
    const min = Math.min(...g.rates),
      max = Math.max(...g.rates);
    return {
      timestamp,
      coin: g.coin,
      type: g.type,
      samples: g.rates.length,
      minRate: min,
      medianRate: median(g.rates),
      maxRate: max,
      spread: max - min,
    };
  });
}

/**

 * Public class MarketHistoryStore used by the module.

 */

export class MarketHistoryStore {
  private readonly path: string;
  private readonly maxPoints: number;
  private points: MarketHistoryPoint[] = [];

  constructor(options: MarketHistoryStoreOptions = {}) {
    this.path = resolve(
      options.path ??
        process.env.MARKET_HISTORY_PATH ??
        "data/market-history.json",
    );
    this.maxPoints = Math.max(100, Math.trunc(options.maxPoints ?? 10000));
  }

  /**
   * Executes the initialize method and preserves the module's documented invariants.

   * @returns Promise<void> returned by the method.
   */
  async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed))
        this.points = parsed.filter(this.validPoint).slice(-this.maxPoints);
    } catch {
      await this.persist();
    }
  }

  async append(
    offers: Offer[],
    timestamp = new Date().toISOString(),
  ): Promise<MarketHistoryPoint[]> {
    const points = summarizeMarket(offers, timestamp);
    if (!points.length) return [];
    this.points.push(...points);
    if (this.points.length > this.maxPoints)
      this.points = this.points.slice(-this.maxPoints);
    await this.persist();
    return points;
  }

  /**
   * Executes the query method and preserves the module's documented invariants.
   * @param limit Input used by the method.
   * @returns MarketHistoryPoint[] returned by the method.
   */
  query(coin?: string, type?: string, limit = 200): MarketHistoryPoint[] {
    const c = coin?.trim().toUpperCase(),
      t = type?.trim().toLowerCase();
    return this.points
      .filter((p) => (!c || p.coin === c) && (!t || p.type === t))
      .slice(-Math.min(Math.max(limit, 1), 1000));
  }

  private validPoint(value: unknown): value is MarketHistoryPoint {
    if (!value || typeof value !== "object") return false;
    const p = value as Partial<MarketHistoryPoint>;
    return (
      typeof p.timestamp === "string" &&
      typeof p.coin === "string" &&
      typeof p.type === "string" &&
      Number.isFinite(Number(p.samples))
    );
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(
      this.path,
      JSON.stringify(this.points, null, 2) + "\n",
      "utf8",
    );
  }
}
