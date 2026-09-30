export interface FinanceLot {
  acquiredAt: string;
  quantity: number;
  unitCost: number;
  sourceUuid: string;
}

export interface FinanceSummary {
  completedCount: number;
  fiatIncome: number;
  fiatExpense: number;
  realizedProfit: number | null;
  realizedProfitKnown: boolean;
  inventoryQusd: number;
  unknownCostQusd: number;
  currency: string;
}

interface P2POffer {
  uuid?: unknown;
  status?: unknown;
  type?: unknown;
  amount?: unknown;
  receive?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
}

const num = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function calculateFinanceSummary(offers: unknown[]): FinanceSummary {
  const completed = offers
    .filter((value): value is P2POffer => !!value && typeof value === "object")
    .filter((offer) => String(offer.status ?? "").toLowerCase() === "completed")
    .sort((a, b) => {
      const ta = Date.parse(String(a.updated_at ?? a.created_at ?? ""));
      const tb = Date.parse(String(b.updated_at ?? b.created_at ?? ""));
      return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
    });

  const lots: FinanceLot[] = [];
  let fiatIncome = 0;
  let fiatExpense = 0;
  let realizedProfit = 0;
  let realizedProfitKnown = true;
  let unknownCostQusd = 0;

  for (const offer of completed) {
    const type = String(offer.type ?? "").toLowerCase();
    const amount = num(offer.amount);
    const receive = num(offer.receive);
    if (amount === null || receive === null || amount < 0 || receive < 0) continue;

    const at = String(offer.updated_at ?? offer.created_at ?? new Date(0).toISOString());
    const uuid = String(offer.uuid ?? "unknown");

    if (type === "buy") {
      fiatExpense += receive;
      lots.push({ acquiredAt: at, quantity: amount, unitCost: amount > 0 ? receive / amount : 0, sourceUuid: uuid });
      continue;
    }

    if (type === "sell") {
      fiatIncome += receive;
      let remaining = amount;

      while (remaining > 0 && lots.length) {
        const lot = lots[0];
        const consumed = Math.min(remaining, lot.quantity);
        realizedProfit += consumed * ((receive / amount) - lot.unitCost);
        lot.quantity -= consumed;
        remaining -= consumed;
        if (lot.quantity <= 1e-12) lots.shift();
      }

      if (remaining > 1e-12) {
        realizedProfitKnown = false;
        unknownCostQusd += remaining;
      }
    }
  }

  const inventoryQusd = lots.reduce((sum, lot) => sum + lot.quantity, 0);

  return {
    completedCount: completed.length,
    fiatIncome,
    fiatExpense,
    realizedProfit: realizedProfitKnown ? realizedProfit : null,
    realizedProfitKnown,
    inventoryQusd,
    unknownCostQusd,
    currency: "QUSD/fiat",
  };
}
