/**
 * @file finance-reconciliation.ts
 * @path src/backend/finance-reconciliation.ts
 * @description Implements finance reconciliation for QvaPay AI Scanner.
 * @module backend
 * @status active
 */
export interface P2PPage {
  data: Record<string, unknown>[];
  total: number;
  perPage: number;
}

/**

 * Public interface ReconciliationResult used by the module.

 */

export interface ReconciliationResult {
  offers: Record<string, unknown>[];
  total: number;
  pagesFetched: number;
  truncated: boolean;
}

/**

 * Public type FetchCompletedPage used by the module.

 */

export type FetchCompletedPage = (page: number) => Promise<P2PPage>;

const MAX_PAGES = 1000;

/**
 * Implements the fetchAllCompletedP2P operation for this module.

 * @returns The operation result.
 */
export async function fetchAllCompletedP2P(fetchPage: FetchCompletedPage): Promise<ReconciliationResult> {
  const offers: Record<string, unknown>[] = [];
  let total = 0;
  let perPage = 100;
  let pagesFetched = 0;
  let lastPage = 1;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await fetchPage(page);
    offers.push(...result.data);
    pagesFetched = page;
    total = Number.isFinite(result.total) ? Math.max(0, Math.trunc(result.total)) : offers.length;
    perPage = Math.max(1, Math.trunc(result.perPage || result.data.length || 100));
    lastPage = Math.max(1, Math.ceil(total / perPage));

    if (page >= lastPage || result.data.length === 0) break;
  }

  return {
    offers,
    total,
    pagesFetched,
    truncated: lastPage > MAX_PAGES,
  };
}

/**
 * Implements the reconcileCompletedIds operation for this module.

 * @returns The operation result.
 */
export function reconcileCompletedIds(
  remoteOffers: Record<string, unknown>[],
  ledgerEntries: { uuid: string }[],
): { remoteCount: number; ledgerCount: number; missingInLedger: string[]; staleLocal: string[] } {
  const remote = new Set(remoteOffers.map((offer) => String(offer.uuid ?? "")).filter(Boolean));
  const local = new Set(ledgerEntries.map((entry) => entry.uuid).filter(Boolean));
  return {
    remoteCount: remote.size,
    ledgerCount: local.size,
    missingInLedger: [...remote].filter((uuid) => !local.has(uuid)),
    staleLocal: [...local].filter((uuid) => !remote.has(uuid)),
  };
}
