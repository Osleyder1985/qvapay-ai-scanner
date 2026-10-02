/**
 * @file arbitrage-market.ts
 * @path src/backend/arbitrage-market.ts
 * @description Contrato determinista para normalizar ofertas P2P y detectar oportunidades de arbitraje sin ejecutar operaciones.
 * @module backend/arbitrage
 * @status active
 */

export type ArbitrageSide = "buy" | "sell";

/**
 * En QvaPay, una oferta SELL permite al usuario comprar QUSD y una oferta BUY
 * permite al usuario vender QUSD. El motor conserva los tipos originales, pero
 * modela explícitamente la dirección de nuestra operación.
 */
export type ArbitrageAction = "acquire" | "exit";

export interface RawArbitrageOffer {
  uuid?: unknown;
  type?: unknown;
  coin?: unknown;
  amount?: unknown;
  available_amount?: unknown;
  receive?: unknown;
  offer_kind?: unknown;
  order_min?: unknown;
  order_max?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
}

export interface NormalizedArbitrageOffer {
  uuid: string;
  side: ArbitrageSide;
  coin: string;
  amountQusd: number;
  availableQusd: number;
  rate: number;
  offerKind: "fixed" | "flexible";
  orderMinQusd: number | null;
  orderMaxQusd: number | null;
  observedAt: string;
}

export interface ArbitrageFeeContext {
  side: ArbitrageSide;
  coin: string;
  quantityQusd: number;
  grossFiat: number;
}

export type ArbitrageFeeCalculator = (
  context: ArbitrageFeeContext,
) => number | null;

export interface ArbitrageFeeModel {
  buy: ArbitrageFeeCalculator;
  sell: ArbitrageFeeCalculator;
}

export interface ArbitrageScanOptions {
  now?: Date;
  maxAgeMs: number;
  maxCapitalFiat: number;
  fees?: ArbitrageFeeModel;
}

export interface ArbitrageOpportunity {
  coin: string;
  buyOfferUuid: string;
  sellOfferUuid: string;
  acquisitionOfferUuid: string;
  exitOfferUuid: string;
  buyRate: number;
  sellRate: number;
  quantityQusd: number;
  capitalRequiredFiat: number;
  grossProfitFiat: number;
  grossMarginPercent: number;
  buyFeeFiat: number | null;
  sellFeeFiat: number | null;
  totalFeesFiat: number | null;
  netProfitFiat: number | null;
  netMarginPercent: number | null;
  feesStatus: "known" | "unknown";
  observedAt: string;
  stale: false;
}

export interface ArbitrageScanResult {
  opportunities: ArbitrageOpportunity[];
  rejected: {
    invalidOffers: number;
    staleOffers: number;
    nonProfitablePairs: number;
    insufficientLiquidity: number;
  };
}

function finitePositive(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseTimestamp(value: unknown): string | null {
  const text = normalizedText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Normaliza una oferta únicamente cuando todos los campos financieros requeridos
 * están presentes y son inequívocos. No aplica valores por defecto ni sustituciones.
 */
export function normalizeArbitrageOffer(
  raw: RawArbitrageOffer,
): NormalizedArbitrageOffer | null {
  const uuid = normalizedText(raw.uuid);
  const side = normalizedText(raw.type).toLowerCase();
  const coin = normalizedText(raw.coin).toUpperCase();
  const amountQusd = finitePositive(raw.amount);
  const receive = finitePositive(raw.receive);
  const observedAt = parseTimestamp(raw.updated_at ?? raw.created_at);
  const rawOfferKind = normalizedText(raw.offer_kind).toLowerCase();
  const offerKind: "fixed" | "flexible" =
    rawOfferKind === "flexible"
      ? "flexible"
      : rawOfferKind === "fixed"
        ? "fixed"
        : raw.available_amount === null
          ? "fixed"
          : "flexible";
  const rawAvailableQusd = finitePositive(raw.available_amount);
  const availableQusd =
    offerKind === "fixed" ? amountQusd : rawAvailableQusd;
  const orderMinQusd =
    offerKind === "flexible" ? finitePositive(raw.order_min) : null;
  const orderMaxQusd =
    offerKind === "flexible" ? finitePositive(raw.order_max) : null;

  if (!uuid || (side !== "buy" && side !== "sell") || !coin) return null;
  if (amountQusd === null || availableQusd === null || receive === null)
    return null;
  if (availableQusd > amountQusd) return null;
  if (offerKind === "flexible" && orderMaxQusd !== null) {
    if (orderMaxQusd > availableQusd) return null;
    if (orderMinQusd !== null && orderMinQusd > orderMaxQusd) return null;
  }

  const rate = receive / amountQusd;
  if (!Number.isFinite(rate) || rate <= 0 || observedAt === null) return null;

  return {
    uuid,
    side,
    coin,
    amountQusd,
    availableQusd,
    rate,
    offerKind,
    orderMinQusd,
    orderMaxQusd,
    observedAt,
  };
}

function fee(
  calculator: ArbitrageFeeCalculator | undefined,
  context: ArbitrageFeeContext,
): number | null {
  if (!calculator) return null;
  const value = calculator(context);
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * Busca oportunidades dentro de cada moneda de forma independiente.
 * Una oferta BUY y una oferta SELL sólo pueden emparejarse si comparten
 * exactamente el mismo identificador de moneda normalizado.
 */
export function scanArbitrage(
  rawOffers: RawArbitrageOffer[],
  options: ArbitrageScanOptions,
): ArbitrageScanResult {
  const nowMs = (options.now ?? new Date()).getTime();
  if (!Number.isFinite(nowMs)) throw new Error("now inválido.");
  if (!Number.isFinite(options.maxAgeMs) || options.maxAgeMs < 0)
    throw new Error("maxAgeMs inválido.");
  if (!Number.isFinite(options.maxCapitalFiat) || options.maxCapitalFiat <= 0)
    throw new Error("maxCapitalFiat inválido.");

  let invalidOffers = 0;
  let staleOffers = 0;
  const byCoin = new Map<string, NormalizedArbitrageOffer[]>();

  for (const raw of rawOffers) {
    const offer = normalizeArbitrageOffer(raw);
    if (!offer) {
      invalidOffers += 1;
      continue;
    }

    const ageMs = nowMs - new Date(offer.observedAt).getTime();
    if (ageMs < 0 || ageMs > options.maxAgeMs) {
      staleOffers += 1;
      continue;
    }

    const group = byCoin.get(offer.coin) ?? [];
    group.push(offer);
    byCoin.set(offer.coin, group);
  }

  const opportunities: ArbitrageOpportunity[] = [];
  let nonProfitablePairs = 0;
  let insufficientLiquidity = 0;

  for (const [coin, offers] of byCoin) {
    // QvaPay semantics: SELL = nosotros compramos QUSD; BUY = nosotros vendemos QUSD.
    const acquisitionOffers = offers
      .filter((offer) => offer.side === "sell")
      .sort((a, b) => a.rate - b.rate);
    const exitOffers = offers
      .filter((offer) => offer.side === "buy")
      .sort((a, b) => b.rate - a.rate);

    let bestOpportunity: ArbitrageOpportunity | null = null;
    let bestScore = -Infinity;

    for (const buy of acquisitionOffers) {
      for (const sell of exitOffers) {
        if (buy.uuid === sell.uuid) continue;

        const spreadPerQusd = sell.rate - buy.rate;
        if (!(spreadPerQusd > 0)) {
          nonProfitablePairs += 1;
          continue;
        }

        const liquidityQusd = Math.min(buy.availableQusd, sell.availableQusd);
        const orderMaxQusd = Math.min(
          buy.orderMaxQusd ?? Number.POSITIVE_INFINITY,
          sell.orderMaxQusd ?? Number.POSITIVE_INFINITY,
        );
        const orderMinQusd = Math.max(
          buy.orderMinQusd ?? 0,
          sell.orderMinQusd ?? 0,
        );
        const capitalLimitedQusd = options.maxCapitalFiat / buy.rate;
        const quantityQusd = Math.min(
          liquidityQusd,
          orderMaxQusd,
          capitalLimitedQusd,
        );

        if (!(quantityQusd > 0) || quantityQusd < orderMinQusd) {
          insufficientLiquidity += 1;
          continue;
        }

        const capitalRequiredFiat = quantityQusd * buy.rate;
        const grossProfitFiat = quantityQusd * spreadPerQusd;
        const grossMarginPercent =
          capitalRequiredFiat > 0
            ? (grossProfitFiat / capitalRequiredFiat) * 100
            : 0;

        const buyFeeFiat = fee(options.fees?.buy, {
          side: "buy",
          coin,
          quantityQusd,
          grossFiat: capitalRequiredFiat,
        });
        const sellProceedsFiat = quantityQusd * sell.rate;
        const sellFeeFiat = fee(options.fees?.sell, {
          side: "sell",
          coin,
          quantityQusd,
          grossFiat: sellProceedsFiat,
        });
        const feesKnown = buyFeeFiat !== null && sellFeeFiat !== null;
        const totalFeesFiat = feesKnown
          ? (buyFeeFiat as number) + (sellFeeFiat as number)
          : null;
        const netProfitFiat =
          totalFeesFiat === null ? null : grossProfitFiat - totalFeesFiat;
        const netMarginPercent =
          netProfitFiat === null || capitalRequiredFiat <= 0
            ? null
            : (netProfitFiat / capitalRequiredFiat) * 100;

        const candidate: ArbitrageOpportunity = {
          coin,
          buyOfferUuid: buy.uuid,
          sellOfferUuid: sell.uuid,
          acquisitionOfferUuid: buy.uuid,
          exitOfferUuid: sell.uuid,
          buyRate: buy.rate,
          sellRate: sell.rate,
          quantityQusd,
          capitalRequiredFiat,
          grossProfitFiat,
          grossMarginPercent,
          buyFeeFiat,
          sellFeeFiat,
          totalFeesFiat,
          netProfitFiat,
          netMarginPercent,
          feesStatus: feesKnown ? "known" : "unknown",
          observedAt:
            buy.observedAt < sell.observedAt ? buy.observedAt : sell.observedAt,
          stale: false,
        };
        const score = netProfitFiat ?? grossProfitFiat;
        if (score > bestScore) {
          bestScore = score;
          bestOpportunity = candidate;
        }
      }
    }

    if (bestOpportunity) opportunities.push(bestOpportunity);
  }

  opportunities.sort((a, b) => b.grossProfitFiat - a.grossProfitFiat);

  return {
    opportunities,
    rejected: {
      invalidOffers,
      staleOffers,
      nonProfitablePairs,
      insufficientLiquidity,
    },
  };
}
