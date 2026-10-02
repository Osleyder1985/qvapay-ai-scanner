/**
 * @file arbitrage-market.ts
 * @path src/backend/arbitrage-market.ts
 * @description Contrato determinista para normalizar ofertas P2P y detectar oportunidades de arbitraje.
 * @module backend/arbitrage
 * @status active
 */

export type ArbitrageSide = "buy" | "sell";

export interface RawArbitrageOffer {
  uuid?: unknown;
  type?: unknown;
  coin?: unknown;
  amount?: unknown;
  available_amount?: unknown;
  receive?: unknown;
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
  const availableQusd = finitePositive(raw.available_amount);
  const receive = finitePositive(raw.receive);
  const observedAt = parseTimestamp(raw.updated_at ?? raw.created_at);

  if (!uuid || (side !== "buy" && side !== "sell") || !coin) return null;
  if (amountQusd === null || availableQusd === null || receive === null)
    return null;
  if (availableQusd > amountQusd) return null;

  const rate = receive / amountQusd;
  if (!Number.isFinite(rate) || rate <= 0 || observedAt === null) return null;

  return {
    uuid,
    side,
    coin,
    amountQusd,
    availableQusd,
    rate,
    observedAt,
  };
}

function fee(
  calculator: ArbitrageFeeCalculator | undefined,
  context: ArbitrageFeeContext,
): number | null {
  if (!calculator) return null;
  const value = calculator(context);
  return Number.isFinite(value) && value >= 0 ? value : null;
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
    const buys = offers
      .filter((offer) => offer.side === "buy")
      .sort((a, b) => a.rate - b.rate);
    const sells = offers
      .filter((offer) => offer.side === "sell")
      .sort((a, b) => b.rate - a.rate);

    const buy = buys[0];
    const sell = sells[0];
    if (!buy || !sell) continue;

    const spreadPerQusd = sell.rate - buy.rate;
    if (!(spreadPerQusd > 0)) {
      nonProfitablePairs += 1;
      continue;
    }

    const liquidityQusd = Math.min(buy.availableQusd, sell.availableQusd);
    const capitalLimitedQusd = options.maxCapitalFiat / buy.rate;
    const quantityQusd = Math.min(liquidityQusd, capitalLimitedQusd);

    if (!(quantityQusd > 0)) {
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

    opportunities.push({
      coin,
      buyOfferUuid: buy.uuid,
      sellOfferUuid: sell.uuid,
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
    });
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
