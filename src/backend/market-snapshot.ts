/**
 * @file market-snapshot.ts
 * @path src/backend/market-snapshot.ts
 * @description Implements market snapshot for QvaPay AI Scanner.
 * @module backend
 * @status active
 */
interface CacheEntry { response: Response; expiresAt: number; }

export interface MarketSnapshotStats {
  cacheHits: number;
  cacheMisses: number;
  queuedRequests: number;
  upstreamRequests: number;
  lastUpstreamAt: string | null;
  rateLimitedResponses: number;
}

export interface MarketSnapshotOptions { cacheTtlMs?: number; minIntervalMs?: number; }
type UpstreamFetcher = (url: URL) => Promise<Response>;

const DEFAULT_CACHE_TTL_MS = 2500;
const DEFAULT_MIN_INTERVAL_MS = 2600;

export class MarketSnapshotService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly minIntervalMs: number;
  private nextAvailableAt = 0;
  private queue: Promise<void> = Promise.resolve();
  private stats: MarketSnapshotStats = { cacheHits: 0, cacheMisses: 0, queuedRequests: 0, upstreamRequests: 0, lastUpstreamAt: null, rateLimitedResponses: 0 };

  constructor(options: MarketSnapshotOptions = {}) {
    this.cacheTtlMs = Math.max(0, Math.trunc(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS));
    this.minIntervalMs = Math.max(0, Math.trunc(options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS));
  }

  async fetch(url: URL, upstream: UpstreamFetcher): Promise<Response> {
    const key = url.toString();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) { this.stats.cacheHits += 1; return cached.response.clone(); }
    this.stats.cacheMisses += 1; this.stats.queuedRequests += 1;
    let release: (() => void) | undefined;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const refreshed = this.cache.get(key);
      if (refreshed && refreshed.expiresAt > Date.now()) { this.stats.cacheHits += 1; return refreshed.response.clone(); }
      const waitMs = Math.max(0, this.nextAvailableAt - Date.now());
      if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      const response = await upstream(url);
      this.nextAvailableAt = Date.now() + this.minIntervalMs;
      if (response.status === 429) {
        this.stats.rateLimitedResponses += 1;
        this.nextAvailableAt = Math.max(this.nextAvailableAt, Date.now() + 10_000);
      }
      this.stats.upstreamRequests += 1; this.stats.lastUpstreamAt = new Date().toISOString();
      if (response.ok) this.cache.set(key, { response: response.clone(), expiresAt: Date.now() + this.cacheTtlMs });
      return response;
    } finally { release?.(); }
  }

  getStats(): MarketSnapshotStats { return { ...this.stats }; }
  clear(): void { this.cache.clear(); }
}