/**
 * @file arbitrage-execution.ts
 * @path src/cloudflare/arbitrage-execution.ts
 * @description Ejecución controlada de aplicaciones P2P para el módulo de arbitraje.
 * @module cloudflare
 * @status active
 */

import {
  qvapay,
  readQvaPayPayload,
  type QvaPayHttpEnv,
} from "./qvapay-http.js";
import type { D1Database } from "./d1.js";

interface ExecutionConfig {
  autoEnabled: boolean;
  maxBuyRate: number | null;
  minSellRate: number | null;
  cupBudget: number;
}

interface MarketOffer {
  uuid: string;
  type: string;
  amountQusd: number;
  availableQusd: number;
  purchaseRate: number;
  capitalRequiredFiat: number;
  onlyVip?: boolean;
}

interface ExecutionStateRow {
  apply_window_json: string;
  last_action_at: string | null;
  last_action: string | null;
}

const APPLY_LIMIT = 2;
const APPLY_WINDOW_MS = 60_000;

function nowIso(): string {
  return new Date().toISOString();
}

async function readExecutionState(db: D1Database): Promise<ExecutionStateRow> {
  const row = await db
    .prepare(
      "SELECT apply_window_json, last_action_at, last_action " +
        "FROM arbitrage_execution_state WHERE id = 1",
    )
    .first<ExecutionStateRow>();
  return (
    row ?? {
      apply_window_json: "[]",
      last_action_at: null,
      last_action: null,
    }
  );
}

function recentApplyTimestamps(value: string): number[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(Number)
      .filter((timestamp) => Number.isFinite(timestamp))
      .filter((timestamp) => timestamp > Date.now() - APPLY_WINDOW_MS)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

async function saveExecutionState(
  db: D1Database,
  timestamps: number[],
  action: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO arbitrage_execution_state " +
        "(id, apply_window_json, last_action_at, last_action, updated_at) " +
        "VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET " +
        "apply_window_json = excluded.apply_window_json, " +
        "last_action_at = excluded.last_action_at, " +
        "last_action = excluded.last_action, updated_at = excluded.updated_at",
    )
    .bind(JSON.stringify(timestamps), nowIso(), action, nowIso())
    .run();
}

async function readQusdBalance(env: QvaPayHttpEnv): Promise<number | null> {
  const response = await qvapay(env, "/v2/balance", { method: "POST" });
  if (!response.ok) return null;
  const payload = await readQvaPayPayload(response);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const direct = Number(record.balance);
  const nested =
    record.data && typeof record.data === "object"
      ? Number((record.data as Record<string, unknown>).balance)
      : Number.NaN;
  const balance = Number.isFinite(direct) ? direct : nested;
  return Number.isFinite(balance) && balance >= 0 ? balance : null;
}

async function applyOffer(
  env: QvaPayHttpEnv,
  offer: MarketOffer,
): Promise<{ ok: boolean; error?: string }> {
  const response = await qvapay(
    env,
    "/p2p/" + encodeURIComponent(offer.uuid) + "/apply",
    { method: "POST" },
  );
  const payload = await readQvaPayPayload(response);
  if (response.ok) return { ok: true };
  const detail =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  return {
    ok: false,
    error:
      typeof detail.code === "string"
        ? detail.code
        : typeof detail.error === "string"
          ? detail.error
          : "QvaPay rechazó la aplicación.",
  };
}

export async function executeArbitrageCandidates(
  db: D1Database,
  env: QvaPayHttpEnv,
  config: ExecutionConfig,
  offers: MarketOffer[],
): Promise<{ applied: string[]; skipped: string[]; message: string }> {
  if (!config.autoEnabled) {
    return {
      applied: [],
      skipped: [],
      message: "Ejecución automática desactivada.",
    };
  }

  const state = await readExecutionState(db);
  const recent = recentApplyTimestamps(state.apply_window_json);
  let slots = Math.max(0, APPLY_LIMIT - recent.length);
  if (slots === 0) {
    return {
      applied: [],
      skipped: [],
      message: "Límite QvaPay de 2 aplicaciones por 60 segundos alcanzado.",
    };
  }

  const sellQusdCandidates = offers
    .filter(
      (offer) =>
        offer.type.toLowerCase() === "sell" &&
        config.maxBuyRate !== null &&
        offer.purchaseRate <= config.maxBuyRate &&
        offer.capitalRequiredFiat <= config.cupBudget &&
        offer.availableQusd > 0 &&
        !offer.onlyVip,
    )
    .sort((a, b) => a.purchaseRate - b.purchaseRate);

  const buyQusdCandidates = offers
    .filter(
      (offer) =>
        offer.type.toLowerCase() === "buy" &&
        config.minSellRate !== null &&
        offer.purchaseRate >= config.minSellRate &&
        offer.availableQusd > 0 &&
        !offer.onlyVip,
    )
    .sort((a, b) => b.purchaseRate - a.purchaseRate);

  let qUsdBalance: number | null = null;
  if (slots > 0 && buyQusdCandidates.length) {
    qUsdBalance = await readQusdBalance(env);
  }

  const selected: MarketOffer[] = [];
  let cupPlanned = 0;
  let qUsdPlanned = 0;

  for (const candidate of sellQusdCandidates) {
    if (selected.length >= slots) break;
    const capital = Number(candidate.capitalRequiredFiat);
    if (!Number.isFinite(capital) || cupPlanned + capital > config.cupBudget)
      continue;
    selected.push(candidate);
    cupPlanned += capital;
  }

  for (const candidate of buyQusdCandidates) {
    if (selected.length >= slots) break;
    if (qUsdBalance === null) break;
    const amount = Number(candidate.availableQusd);
    if (!Number.isFinite(amount) || qUsdPlanned + amount > qUsdBalance)
      continue;
    selected.push(candidate);
    qUsdPlanned += amount;
  }

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const candidate of selected) {
    const result = await applyOffer(env, candidate);
    if (!result.ok) {
      skipped.push(candidate.uuid + ":" + (result.error ?? "rejected"));
      continue;
    }
    applied.push(candidate.uuid);
    recent.push(Date.now());
    slots -= 1;
    if (candidate.type.toLowerCase() === "sell") {
      const remainingBudget = Math.max(
        0,
        config.cupBudget - Number(candidate.capitalRequiredFiat),
      );
      await db
        .prepare(
          "UPDATE arbitrage_monitor_config " +
            "SET cup_budget = ?, updated_at = ? WHERE id = 1",
        )
        .bind(remainingBudget, nowIso())
        .run();
    }
  }

  await saveExecutionState(
    db,
    recent.filter((timestamp) => timestamp > Date.now() - APPLY_WINDOW_MS),
    applied.length
      ? "Aplicadas automáticamente: " + applied.join(", ")
      : "Sin aplicaciones automáticas en este ciclo.",
  );

  return {
    applied,
    skipped,
    message:
      applied.length > 0
        ? "Aplicaciones automáticas ejecutadas: " + applied.join(", ")
        : "No hubo ofertas que cumplieran todos los límites configurados.",
  };
}
