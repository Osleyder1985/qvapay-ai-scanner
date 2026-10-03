/**
 * @file arbitrage-market-history.ts
 * @path src/backend/arbitrage-market-history.ts
 * @description Normaliza eventos P2P y calcula analítica de ejecución por moneda.
 * @module backend/arbitrage
 * @status active
 */

export type MarketEventSource = "stream" | "webhook" | "reconciliation";
export type MarketEventType =
  "created" | "reopened" | "applied" | "paid" | "completed" | "cancelled";

export interface RawMarketEvent {
  eventId?: unknown;
  offerUuid?: unknown;
  event?: unknown;
  status?: unknown;
  type?: unknown;
  coin?: unknown;
  amount?: unknown;
  availableAmount?: unknown;
  receive?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  eventAt?: unknown;
  observedAt?: unknown;
  source: unknown;
}

export interface NormalizedMarketEvent {
  dedupeKey: string;
  eventId: string | null;
  offerUuid: string;
  event: MarketEventType;
  status: string | null;
  side: string | null;
  coin: string;
  amount: number | null;
  availableAmount: number | null;
  receive: number | null;
  rate: number | null;
  eventAt: string;
  observedAt: string;
  source: MarketEventSource;
}

export interface CompletedTrade {
  offerUuid: string;
  coin: string;
  side: string | null;
  amount: number;
  receive: number;
  rate: number;
  completedAt: string;
}

export interface CurrencyExecutionAnalytics {
  coin: string;
  windowSize: number;
  completedCount: number;
  cancelledCount: number;
  terminalCount: number;
  completionRatePercent: number | null;
  cancellationRatePercent: number | null;
  minRate: number | null;
  maxRate: number | null;
  meanRate: number | null;
  medianRate: number | null;
  percentiles: Record<string, number | null>;
  vwap: number | null;
  tradedVolumeQusd: number;
  averageTimeToCompletionMs: number | null;
  newestEventAt: string | null;
  newestObservedAt: string | null;
  stale: boolean;
}

const EVENTS = new Set<MarketEventType>([
  "created",
  "reopened",
  "applied",
  "paid",
  "completed",
  "cancelled",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positive(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nonNegative(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function timestamp(value: unknown): string | null {
  const valueText = text(value);
  if (!valueText) return null;
  const date = new Date(valueText);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeEventName(value: unknown): MarketEventType | null {
  const raw = text(value)
    .toLowerCase()
    .replace(/^p2p\./, "");
  return EVENTS.has(raw as MarketEventType) ? (raw as MarketEventType) : null;
}

function stableKey(parts: Array<string | number | null>): string {
  return parts.map((part) => String(part ?? "")).join("|");
}

/**
 * Normaliza un evento sin inferir un estado terminal a partir de la
 * desaparición de una oferta. Los eventos desconocidos se rechazan de forma
 * explícita.
 */
export function normalizeMarketEvent(
  raw: RawMarketEvent,
  now = new Date(),
): NormalizedMarketEvent | null {
  const offerUuid = text(raw.offerUuid);
  const event = normalizeEventName(raw.event ?? raw.status);
  const coin = text(raw.coin).toUpperCase();
  const source = text(raw.source).toLowerCase() as MarketEventSource;
  const eventAt =
    timestamp(raw.eventAt) ??
    timestamp(raw.updatedAt) ??
    timestamp(raw.createdAt);
  const observedAt = timestamp(raw.observedAt) ?? now.toISOString();

  if (
    !offerUuid ||
    !event ||
    !coin ||
    !["stream", "webhook", "reconciliation"].includes(source) ||
    !eventAt ||
    !Number.isFinite(new Date(observedAt).getTime())
  ) {
    return null;
  }

  const amount = positive(raw.amount);
  const availableAmount = nonNegative(raw.availableAmount);
  const receive = positive(raw.receive);
  const rate = amount !== null && receive !== null ? receive / amount : null;

  const eventId = text(raw.eventId) || null;
  // La identidad del ciclo de vida prevalece para la analítica.
  // Los IDs de evento pueden diferir entre webhook, stream y reconciliación.
  const dedupeKey = stableKey([offerUuid, event]);

  return {
    dedupeKey,
    eventId,
    offerUuid,
    event,
    status: text(raw.status).toLowerCase() || null,
    side: text(raw.type).toLowerCase() || null,
    coin,
    amount,
    availableAmount,
    receive,
    rate: rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null,
    eventAt,
    observedAt,
    source,
  };
}

export function deduplicateMarketEvents(
  events: NormalizedMarketEvent[],
): NormalizedMarketEvent[] {
  const canonical = new Map<string, NormalizedMarketEvent>();
  for (const event of events) {
    const lifecycleKey = stableKey([event.offerUuid, event.event]);
    const current = canonical.get(lifecycleKey);
    if (!current) {
      canonical.set(lifecycleKey, event);
      continue;
    }

    const eventAt = new Date(event.eventAt).getTime();
    const currentEventAt = new Date(current.eventAt).getTime();
    const observedAt = new Date(event.observedAt).getTime();
    const currentObservedAt = new Date(current.observedAt).getTime();

    // La creación representa el inicio real del ciclo: conservar la primera
    // fecha de creación. Para el resto de estados, conservar la observación
    // más reciente, que es la que puede contener el payload final corregido.
    const shouldReplace =
      event.event === "created"
        ? eventAt < currentEventAt ||
          (eventAt === currentEventAt && observedAt > currentObservedAt)
        : observedAt > currentObservedAt ||
          (observedAt === currentObservedAt && eventAt > currentEventAt);

    if (shouldReplace) canonical.set(lifecycleKey, event);
  }

  return [...canonical.values()].sort(
    (a, b) =>
      new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime() ||
      new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
  );
}

function isValidCompletedTrade(event: NormalizedMarketEvent): boolean {
  if (
    event.amount === null ||
    event.receive === null ||
    event.rate === null ||
    !Number.isFinite(event.amount) ||
    !Number.isFinite(event.receive) ||
    !Number.isFinite(event.rate) ||
    event.amount <= 0 ||
    event.receive <= 0 ||
    event.rate <= 0
  ) {
    return false;
  }

  const derivedRate = event.receive / event.amount;
  const tolerance =
    Math.max(Math.abs(derivedRate), Math.abs(event.rate), 1) * 1e-9;
  return Math.abs(derivedRate - event.rate) <= tolerance;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower]!;
  const high = sorted[upper]!;
  return lower === upper ? low : low + (high - low) * (position - lower);
}

export function completedTradesFromEvents(
  events: NormalizedMarketEvent[],
): CompletedTrade[] {
  return deduplicateMarketEvents(events)
    .filter(
      (event) => event.event === "completed" && isValidCompletedTrade(event),
    )
    .map((event) => ({
      offerUuid: event.offerUuid,
      coin: event.coin,
      side: event.side,
      amount: event.amount!,
      receive: event.receive!,
      rate: event.rate!,
      completedAt: event.eventAt,
    }))
    .sort(
      (a, b) =>
        new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime() ||
        a.offerUuid.localeCompare(b.offerUuid),
    );
}

/**
 * Calcula una ventana por moneda. La ventana se aplica después de filtrar
 * operaciones completadas; una cancelación no se presenta como una ejecución.
 */
export function calculateCurrencyAnalytics(
  events: NormalizedMarketEvent[],
  coin: string,
  options: { windowSize?: number; now?: Date; maxAgeMs?: number } = {},
): CurrencyExecutionAnalytics {
  const normalizedCoin = coin.trim().toUpperCase();
  const windowSize = Math.max(1, Math.trunc(options.windowSize ?? 500));
  const all = deduplicateMarketEvents(events).filter(
    (event) => event.coin === normalizedCoin,
  );
  const completedOfferIdsInOrder: string[] = [];
  const completedOfferIdsSeen = new Set<string>();
  const completedEvents = all
    .filter(
      (event) => event.event === "completed" && isValidCompletedTrade(event),
    )
    .sort(
      (a, b) =>
        new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime() ||
        new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime() ||
        a.offerUuid.localeCompare(b.offerUuid),
    );
  for (const event of completedEvents) {
    if (completedOfferIdsSeen.has(event.offerUuid)) continue;
    completedOfferIdsSeen.add(event.offerUuid);
    completedOfferIdsInOrder.push(event.offerUuid);
  }
  const completedOfferIds = new Set(
    completedOfferIdsInOrder.slice(-windowSize),
  );
  const terminalEvents = all.filter(
    (event) => event.event === "completed" || event.event === "cancelled",
  );
  const terminalOfferIdsInOrder: string[] = [];
  const terminalOfferIdsSeen = new Set<string>();
  for (const event of terminalEvents.sort(
    (a, b) =>
      new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime() ||
      new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime() ||
      a.offerUuid.localeCompare(b.offerUuid),
  )) {
    if (terminalOfferIdsSeen.has(event.offerUuid)) continue;
    terminalOfferIdsSeen.add(event.offerUuid);
    terminalOfferIdsInOrder.push(event.offerUuid);
  }
  const terminalOfferIds = new Set(terminalOfferIdsInOrder.slice(-windowSize));
  const windowEvents = all.filter((event) =>
    terminalOfferIds.has(event.offerUuid),
  );
  const completed = completedTradesFromEvents(windowEvents).filter((trade) =>
    completedOfferIds.has(trade.offerUuid),
  );
  const completedIds = new Set(completed.map((trade) => trade.offerUuid));
  const cancelledIds = new Set(
    windowEvents
      .filter((event) => event.event === "cancelled")
      .map((event) => event.offerUuid),
  );
  const cancelledCount = cancelledIds.size;
  const terminalCount = completedIds.size + cancelledIds.size;
  const rates = completed
    .map((trade) => trade.rate)
    .filter((rate) => Number.isFinite(rate) && rate > 0)
    .sort((a, b) => a - b);
  const volume = completed.reduce(
    (sum, trade) =>
      Number.isFinite(trade.amount) && trade.amount > 0
        ? sum + trade.amount
        : sum,
    0,
  );
  const weightedValue = completed.reduce(
    (sum, trade) =>
      Number.isFinite(trade.rate) &&
      trade.rate > 0 &&
      Number.isFinite(trade.amount) &&
      trade.amount > 0
        ? sum + trade.rate * trade.amount
        : sum,
    0,
  );
  const completionTimes = completed
    .map((trade) => {
      const created = all
        .filter(
          (event) =>
            event.offerUuid === trade.offerUuid && event.event === "created",
        )
        .sort(
          (a, b) =>
            new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime(),
        )[0];
      if (!created) return null;
      const delta =
        new Date(trade.completedAt).getTime() -
        new Date(created.eventAt).getTime();
      return delta >= 0 ? delta : null;
    })
    .filter((value): value is number => value !== null);

  const newest = all
    .map((event) => event.eventAt)
    .sort()
    .at(-1);
  const newestObserved = all
    .map((event) => event.observedAt)
    .sort()
    .at(-1);
  const nowMs = (options.now ?? new Date()).getTime();
  const newestObservedMs = newestObserved
    ? new Date(newestObserved).getTime()
    : NaN;
  const stale =
    options.maxAgeMs !== undefined &&
    Number.isFinite(nowMs) &&
    Number.isFinite(newestObservedMs)
      ? nowMs - newestObservedMs > options.maxAgeMs
      : false;

  return {
    coin: normalizedCoin,
    windowSize,
    completedCount: completed.length,
    cancelledCount,
    terminalCount,
    completionRatePercent:
      terminalCount > 0 ? (completedIds.size / terminalCount) * 100 : null,
    cancellationRatePercent:
      terminalCount > 0 ? (cancelledIds.size / terminalCount) * 100 : null,
    minRate: rates.at(0) ?? null,
    maxRate: rates.at(-1) ?? null,
    meanRate:
      rates.length > 0
        ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length
        : null,
    medianRate: percentile(rates, 0.5),
    percentiles: {
      p10: percentile(rates, 0.1),
      p25: percentile(rates, 0.25),
      p50: percentile(rates, 0.5),
      p75: percentile(rates, 0.75),
      p90: percentile(rates, 0.9),
    },
    vwap: volume > 0 ? weightedValue / volume : null,
    tradedVolumeQusd: volume,
    averageTimeToCompletionMs:
      completionTimes.length > 0
        ? completionTimes.reduce((sum, value) => sum + value, 0) /
          completionTimes.length
        : null,
    newestEventAt: newest ?? null,
    newestObservedAt: newestObserved ?? null,
    stale,
  };
}
