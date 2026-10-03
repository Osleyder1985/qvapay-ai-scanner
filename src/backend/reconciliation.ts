/**
 * @file reconciliation.ts
 * @path src/backend/reconciliation.ts
 * @description Deterministic cross-layer reconciliation for market, operations and finance evidence.
 * @module backend/reconciliation
 * @status active
 */

import type { NormalizedMarketEvent } from "./arbitrage-market-history.js";

export const MARKET_HISTORY_MATCH_WINDOW_MS = 5 * 60 * 1000;

export interface ReconciliationOperation {
  uuid: string;
  payload: Record<string, unknown>;
}

export interface ReconciliationFinanceEntry {
  uuid: string;
  status: string;
}

export interface ReconciliationMarketHistoryPoint {
  timestamp: string;
  coin: string;
  type: string;
}

export interface ReconciliationReport {
  operationIds: string[];
  eventOfferUuids: string[];
  financeIds: string[];
  completedEventIds: string[];
  completedOperationIds: string[];
  completedFinanceIds: string[];
  eventMissingOperations: string[];
  operationMissingEvents: string[];
  operationMissingFinance: string[];
  financeMissingOperations: string[];
  marketHistoryMatchedCompletedEvents: string[];
  marketHistoryUnmatchedCompletedEvents: string[];
  idempotent: true;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: unknown): number | null {
  const valueText = text(value);
  if (!valueText) return null;
  const valueMs = new Date(valueText).getTime();
  return Number.isFinite(valueMs) ? valueMs : null;
}

function statusOf(operation: ReconciliationOperation): string {
  return text(operation.payload.status).toLowerCase();
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/**
 * Correlates durable layers using QvaPay UUID/offer UUID as the canonical
 * operation identity. Market history is aggregate evidence, not a one-row
 * ledger counterpart, so its result is reported as coverage rather than a
 * hard referential-integrity failure.
 */
export function reconcileLayerState(input: {
  events: NormalizedMarketEvent[];
  operations: ReconciliationOperation[];
  finance: ReconciliationFinanceEntry[];
  marketHistory: ReconciliationMarketHistoryPoint[];
}): ReconciliationReport {
  const operationsById = new Map(
    input.operations
      .map((operation) => [text(operation.uuid), operation] as const)
      .filter(([uuid]) => Boolean(uuid)),
  );
  const financeById = new Map(
    input.finance
      .map((entry) => [text(entry.uuid), entry] as const)
      .filter(([uuid]) => Boolean(uuid)),
  );

  const canonicalEvents = input.events.filter((event) => !event.quarantined);
  const completedEvents = canonicalEvents.filter(
    (event) => event.event === "completed",
  );
  const completedOperations = [...operationsById.values()].filter(
    (operation) => statusOf(operation) === "completed",
  );

  const operationIds = sorted(operationsById.keys());
  const eventOfferUuids = sorted(
    canonicalEvents.map((event) => event.offerUuid),
  );
  const financeIds = sorted(financeById.keys());
  const completedEventIds = sorted(
    completedEvents.map((event) => event.offerUuid),
  );
  const completedOperationIds = sorted(
    completedOperations.map((operation) => operation.uuid),
  );
  const completedFinanceIds = sorted(
    [...financeById.values()]
      .filter((entry) => entry.status === "completed")
      .map((entry) => entry.uuid),
  );

  const operationSet = new Set(operationIds);
  const financeSet = new Set(financeIds);
  const completedEventSet = new Set(completedEventIds);
  const completedOperationSet = new Set(completedOperationIds);

  const eventMissingOperations = sorted(
    completedEventIds.filter((id) => !operationSet.has(id)),
  );
  const operationMissingEvents = sorted(
    completedOperationIds.filter((id) => !completedEventSet.has(id)),
  );
  const operationMissingFinance = sorted(
    completedOperationIds.filter((id) => !financeSet.has(id)),
  );
  const financeMissingOperations = sorted(
    completedFinanceIds.filter((id) => !completedOperationSet.has(id)),
  );

  const matchedHistory = new Set<string>();
  const unmatchedHistory = new Set<string>();
  for (const event of completedEvents) {
    const eventMs = timestamp(event.eventAt);
    const type = event.side?.toLowerCase() ?? "";
    const matched = input.marketHistory.some((point) => {
      if (point.coin.toUpperCase() !== event.coin.toUpperCase()) return false;
      if (type && point.type.toLowerCase() !== type) return false;
      const pointMs = timestamp(point.timestamp);
      return (
        eventMs !== null &&
        pointMs !== null &&
        Math.abs(pointMs - eventMs) <= MARKET_HISTORY_MATCH_WINDOW_MS
      );
    });
    (matched ? matchedHistory : unmatchedHistory).add(event.offerUuid);
  }

  return {
    operationIds,
    eventOfferUuids,
    financeIds,
    completedEventIds,
    completedOperationIds,
    completedFinanceIds,
    eventMissingOperations: sorted(eventMissingOperations),
    operationMissingEvents,
    operationMissingFinance,
    financeMissingOperations,
    marketHistoryMatchedCompletedEvents: sorted(matchedHistory),
    marketHistoryUnmatchedCompletedEvents: sorted(unmatchedHistory),
    idempotent: true,
  };
}
