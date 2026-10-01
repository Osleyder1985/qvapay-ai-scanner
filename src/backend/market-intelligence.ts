/**
 * @file market-intelligence.ts
 * @path src/backend/market-intelligence.ts
 * @description Implementa la inteligencia de mercado de QvaPay AI Scanner.
 * @module backend
 * @status active
 */
export interface MarketOffer {
  uuid?: string;
  id?: string;
  type?: string;
  coin?: string;
  amount?: number | string;
  receive?: number | string;
  status?: string;
  User?: { username?: string; rating_avg?: number | string; kyc?: boolean };
}

/**

 * interface OpportunitySignal público utilizado por el módulo.

 */

export interface OpportunitySignal {
  uuid: string;
  type: string;
  coin: string;
  amount: number;
  receive: number;
  rate: number;
  score: number;
  reasons: string[];
}

/**

 * interface MarketCoinIntelligence público utilizado por el módulo.

 */

export interface MarketCoinIntelligence {
  coin: string;
  sampleSize: number;
  validRates: number;
  bestRate: number | null;
  medianRate: number | null;
  minRate: number | null;
  maxRate: number | null;
  spread: number | null;
  sellCount: number;
  buyCount: number;
  openCount: number;
  opportunities: OpportunitySignal[];
}

/**

 * interface MarketIntelligence público utilizado por el módulo.

 */

export interface MarketIntelligence {
  sampleSize: number;
  validRates: number;
  bestRate: number | null;
  medianRate: number | null;
  minRate: number | null;
  maxRate: number | null;
  spread: number | null;
  sellCount: number;
  buyCount: number;
  coins: string[];
  opportunities: OpportunitySignal[];
  byCoin: MarketCoinIntelligence[];
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : NaN);

/**
 * Implementa la operación median de este módulo.
 * @param a Entrada utilizada por la operation.
 * @returns Resultado de la operación.
 */
function median(a: number[]): number | null {
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
}

/**
 * Implementa la operación calculateGroup de este módulo.
 * @param coin Entrada utilizada por la operation.
 * @param offers Entrada utilizada por la operation.
 * @returns Resultado de la operación.
 */
function calculateGroup(
  coin: string,
  offers: MarketOffer[],
): MarketCoinIntelligence {
  const valid = offers
    .map((o) => ({ o, amount: n(o.amount), receive: n(o.receive) }))
    .filter((x) => x.amount > 0 && x.receive >= 0)
    .map((x) => ({ ...x, rate: x.receive / x.amount }));
  const rates = valid.map((x) => x.rate),
    med = median(rates);
  const opportunities = valid
    .map(({ o, amount, receive, rate }) => {
      const reasons: string[] = [];
      if (med !== null && rate > med)
        reasons.push("Tasa por encima de la mediana de esta moneda");
      if (String(o.status ?? "open").toLowerCase() === "open")
        reasons.push("Oferta abierta");
      if (o.User?.kyc) reasons.push("KYC informado");
      const rating = Number(o.User?.rating_avg);
      if (Number.isFinite(rating) && rating > 0)
        reasons.push("Rating informado");
      let score = String(o.status ?? "open").toLowerCase() === "open" ? 25 : 0;
      if (med !== null && med > 0)
        score += Math.min(40, Math.max(0, (rate / med - 1) * 1000));
      if (o.User?.kyc) score += 15;
      if (Number.isFinite(rating) && rating > 0)
        score += Math.min(20, rating * 4);
      return {
        uuid: String(o.uuid ?? o.id ?? ""),
        type: String(o.type ?? ""),
        coin,
        amount,
        receive,
        rate,
        score: Math.round(Math.min(100, score)),
        reasons,
      };
    })
    .filter((x) => x.uuid)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return {
    coin,
    sampleSize: offers.length,
    validRates: rates.length,
    bestRate: rates.length ? Math.max(...rates) : null,
    medianRate: med,
    minRate: rates.length ? Math.min(...rates) : null,
    maxRate: rates.length ? Math.max(...rates) : null,
    spread: rates.length ? Math.max(...rates) - Math.min(...rates) : null,
    sellCount: offers.filter((o) => String(o.type).toLowerCase() === "sell")
      .length,
    buyCount: offers.filter((o) => String(o.type).toLowerCase() === "buy")
      .length,
    openCount: offers.filter(
      (o) => String(o.status ?? "open").toLowerCase() === "open",
    ).length,
    opportunities,
  };
}

/**
 * Implementa la operación calculateMarketIntelligence de este módulo.
 * @param offers Entrada utilizada por la operation.
 * @returns Resultado de la operación.
 */
export function calculateMarketIntelligence(
  offers: MarketOffer[],
): MarketIntelligence {
  const groups = new Map<string, MarketOffer[]>();
  for (const offer of offers) {
    const coin =
      String(offer.coin ?? "")
        .trim()
        .toUpperCase() || "SIN_MONEDA";
    const group = groups.get(coin) ?? [];
    group.push(offer);
    groups.set(coin, group);
  }

  const byCoin = [...groups.entries()]
    .map(([coin, items]) => calculateGroup(coin, items))
    .sort((a, b) => a.coin.localeCompare(b.coin));

  const valid = offers
    .map((o) => ({ o, amount: n(o.amount), receive: n(o.receive) }))
    .filter((x) => x.amount > 0 && x.receive >= 0)
    .map((x) => ({ ...x, rate: x.receive / x.amount }));
  const rates = valid.map((x) => x.rate),
    med = median(rates);

  return {
    sampleSize: offers.length,
    validRates: rates.length,
    bestRate: rates.length ? Math.max(...rates) : null,
    medianRate: med,
    minRate: rates.length ? Math.min(...rates) : null,
    maxRate: rates.length ? Math.max(...rates) : null,
    spread: rates.length ? Math.max(...rates) - Math.min(...rates) : null,
    sellCount: offers.filter((o) => String(o.type).toLowerCase() === "sell")
      .length,
    buyCount: offers.filter((o) => String(o.type).toLowerCase() === "buy")
      .length,
    coins: byCoin.map((g) => g.coin),
    opportunities: byCoin
      .flatMap((g) => g.opportunities)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
    byCoin,
  };
}
