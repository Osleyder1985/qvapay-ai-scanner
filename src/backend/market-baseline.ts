/**
 * @file market-baseline.ts
 * @path src/backend/market-baseline.ts
 * @description Implementa la línea base de mercado de QvaPay AI Scanner.
 * @module backend
 * @status active
 */
export interface BaselinePoint {
  coin: string;
  type: string;
  timestamp: string;
  medianRate: number | null;
  samples: number;
}

/**

 * interface MarketBaseline público utilizado por el módulo.

 */

export interface MarketBaseline {
  coin: string;
  type: string;
  observations: number;
  baselineRate: number | null;
  currentRate: number | null;
  deviationPercent: number | null;
  minRate: number | null;
  maxRate: number | null;
  status: "above" | "below" | "near" | "insufficient";
}

/**
 * Implementa la operación calculateBaseline de este módulo.
 * @param points Entrada utilizada por la operation.
 * @param lookback Entrada utilizada por la operation.
 * @returns Resultado de la operación.
 */
export function calculateBaseline(
  points: BaselinePoint[],
  lookback = 24,
): MarketBaseline {
  if (!points.length)
    return {
      coin: "",
      type: "",
      observations: 0,
      baselineRate: null,
      currentRate: null,
      deviationPercent: null,
      minRate: null,
      maxRate: null,
      status: "insufficient",
    };
  const sorted = [...points].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const recent = sorted
    .slice(-Math.max(1, Math.trunc(lookback)))
    .filter((p) => Number.isFinite(p.medianRate));
  const first = recent[0],
    last = recent.at(-1);
  const values = recent.map((p) => p.medianRate as number);
  if (!first || !last)
    return {
      coin: sorted[0]?.coin ?? "",
      type: sorted[0]?.type ?? "",
      observations: 0,
      baselineRate: null,
      currentRate: null,
      deviationPercent: null,
      minRate: null,
      maxRate: null,
      status: "insufficient",
    };
  const baseline = values.reduce((a, b) => a + b, 0) / values.length;
  const current = last.medianRate as number;
  const deviation =
    baseline !== 0 ? ((current - baseline) / baseline) * 100 : null;
  const status =
    deviation === null
      ? "insufficient"
      : Math.abs(deviation) < 1
        ? "near"
        : deviation > 0
          ? "above"
          : "below";
  return {
    coin: last.coin,
    type: last.type,
    observations: recent.length,
    baselineRate: baseline,
    currentRate: current,
    deviationPercent: deviation,
    minRate: Math.min(...values),
    maxRate: Math.max(...values),
    status,
  };
}

/**
 * Implementa la operación calculateBaselines de este módulo.
 * @param points Entrada utilizada por la operation.
 * @param lookback Entrada utilizada por la operation.
 * @returns Resultado de la operación.
 */
export function calculateBaselines(
  points: BaselinePoint[],
  lookback = 24,
): MarketBaseline[] {
  const groups = new Map<string, BaselinePoint[]>();
  for (const p of points) {
    const key = p.type + "|" + p.coin;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  return [...groups.values()].map((g) => calculateBaseline(g, lookback));
}
