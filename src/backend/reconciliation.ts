/**
 * @file reconciliation.ts
 * @path src/backend/reconciliation.ts
 * @description Deterministic cross-layer reconciliation for market, operations and finance evidence.
 * @module backend/reconciliation
 * @status active
 */

import type { NormalizedMarketEvent } from "./arbitrage-market-history.js";

export const MARKET_HISTORY_MATCH_WINDOW_MS = 5 * 60 * 1000;
export const STALE_LIFECYCLE_THRESHOLD_MS = 15 * 60 * 1000;

export type ReconciliationDiscrepancyCategory =
  | "event_missing_operation"
  | "operation_missing_event"
  | "operation_missing_finance"
  | "finance_missing_operation"
  | "market_history_unmatched_event"
  | "stale_lifecycle"
  | "duplicate_identity"
  | "conflicting_identity";

export interface ReconciliationDiscrepancy {
  category: ReconciliationDiscrepancyCategory;
  identity: string;
  sourceIds: string[];
  timestamps: string[];
}

export interface ReconciliationOperation {
  uuid: string;
  payload: Record<string, unknown>;
}

export interface ReconciliationFinanceEntry {
  uuid: string;
  status: string;
  timestamp?: string | null;
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
  discrepancies: ReconciliationDiscrepancy[];
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
  now?: string | Date;
  staleAfterMs?: number;
}): ReconciliationReport {
  const operationEntries = input.operations
    .map((operation) => [text(operation.uuid), operation] as const)
    .filter(([uuid]) => Boolean(uuid));
  const financeEntries = input.finance
    .map((entry) => [text(entry.uuid), entry] as const)
    .filter(([uuid]) => Boolean(uuid));
  const operationsById = new Map(operationEntries);
  const financeById = new Map(financeEntries);
  const discrepancyMap = new Map<string, ReconciliationDiscrepancy>();
  const addDiscrepancy = (
    category: ReconciliationDiscrepancyCategory,
    identity: string,
    sourceIds: Iterable<string>,
    timestamps: Iterable<string | null | undefined>,
  ): void => {
    const key = category + ":" + identity;
    const existing = discrepancyMap.get(key);
    const mergedSourceIds = sorted([
      ...(existing?.sourceIds ?? []),
      ...sourceIds,
    ]);
    const mergedTimestamps = sorted([
      ...(existing?.timestamps ?? []),
      ...[...timestamps].filter((value): value is string => Boolean(value)),
    ]);
    discrepancyMap.set(key, {
      category,
      identity,
      sourceIds: mergedSourceIds,
      timestamps: mergedTimestamps,
    });
  };

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

  const operationCounts = new Map<string, number>();
  for (const [uuid] of operationEntries) {
    operationCounts.set(uuid, (operationCounts.get(uuid) ?? 0) + 1);
  }
  for (const [uuid, count] of operationCounts) {
    if (count > 1) {
      addDiscrepancy(
        "duplicate_identity",
        uuid,
        [uuid],
        operationEntries
          .filter(([entryId]) => entryId === uuid)
          .map(([, entry]) => text(entry.payload.updated_at ?? entry.payload.created_at)),
      );
    }
  }

  const financeCounts = new Map<string, number>();
  for (const [uuid] of financeEntries) {
    financeCounts.set(uuid, (financeCounts.get(uuid) ?? 0) + 1);
  }
  for (const [uuid, count] of financeCounts) {
    if (count > 1) {
      addDiscrepancy(
        "duplicate_identity",
        uuid,
        [uuid],
        financeEntries
          .filter(([entryId]) => entryId === uuid)
          .map(([, entry]) => entry.timestamp),
      );
    }
  }

  for (const operation of input.operations) {
    const payloadUuid = text(operation.payload.uuid ?? operation.payload.id);
    const uuid = text(operation.uuid);
    if (payloadUuid && uuid && payloadUuid !== uuid) {
      addDiscrepancy(
        "conflicting_identity",
        uuid,
        [uuid, payloadUuid],
        [text(operation.payload.updated_at), text(operation.payload.created_at)],
      );
    }
  }
  const completedEventSet = new Set(completedEventIds);
  const completedOperationSet = new Set(completedOperationIds);

  const eventMissingOperations = sorted(
    completedEventIds.filter((id) => !operationSet.has(id)),
  );
  for (const id of eventMissingOperations) {
    const event = completedEvents.find((item) => item.offerUuid === id);
    addDiscrepancy(
      "event_missing_operation",
      id,
      [event?.eventId ?? id],
      [event?.eventAt, event?.observedAt],
    );
  }
  const operationMissingEvents = sorted(
    completedOperationIds.filter((id) => !completedEventSet.has(id)),
  );
  for (const id of operationMissingEvents) {
    const operation = operationsById.get(id);
    addDiscrepancy(
      "operation_missing_event",
      id,
      [id],
      [text(operation?.payload.updated_at), text(operation?.payload.created_at)],
    );
  }
  const operationMissingFinance = sorted(
    completedOperationIds.filter((id) => !financeSet.has(id)),
  );
  for (const id of operationMissingFinance) {
    const operation = operationsById.get(id);
    addDiscrepancy(
      "operation_missing_finance",
      id,
      [id],
      [text(operation?.payload.updated_at), text(operation?.payload.created_at)],
    );
  }
  const financeMissingOperations = sorted(
    completedFinanceIds.filter((id) => !completedOperationSet.has(id)),
  );
  for (const id of financeMissingOperations) {
    const finance = financeById.get(id);
    addDiscrepancy(
      "finance_missing_operation",
      id,
      [id],
      [finance?.timestamp],
    );
  }

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
    if (!matched) {
      addDiscrepancy(
        "market_history_unmatched_event",
        event.offerUuid,
        [event.eventId ?? event.offerUuid],
        [event.eventAt, event.observedAt],
      );
    }
  }

  const nowMs = timestamp(input.now ?? new Date()) ?? Date.now();
  const staleAfterMs = input.staleAfterMs ?? STALE_LIFECYCLE_THRESHOLD_MS;
  const nonTerminal = new Set(["created", "reopened", "applied", "paid"]);
  const latestByOffer = new Map<string, NormalizedMarketEvent>();
  for (const event of canonicalEvents) {
    if (!nonTerminal.has(event.event)) continue;
    const current = latestByOffer.get(event.offerUuid);
    if (
      !current ||
      timestamp(event.eventAt) !== null &&
      (timestamp(current.eventAt) === null ||
        timestamp(event.eventAt)! > timestamp(current.eventAt)!)
    ) {
      latestByOffer.set(event.offerUuid, event);
    }
  }
  for (const event of latestByOffer.values()) {
    const eventMs = timestamp(event.eventAt);
    if (eventMs !== null && nowMs - eventMs > staleAfterMs) {
      addDiscrepancy(
        "stale_lifecycle",
        event.offerUuid,
        [event.eventId ?? event.offerUuid],
        [event.eventAt, event.observedAt],
      );
    }
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
    discrepancies: [...discrepancyMap.values()].sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.identity.localeCompare(b.identity),
    ),
    idempotent: true,
  };
}
