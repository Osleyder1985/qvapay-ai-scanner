# Finance reconciliation policy

## Source of truth

The finance endpoint now reads the complete authenticated P2P history with my=1 and status=completed, using QvaPay pagination at 100 records per page. The local ledger is a persistent, UUID-keyed mirror used for auditability and FIFO cost-basis calculations.

The implementation does not assume that the first 100 completed offers are the complete history.

## Reconciliation

Each finance refresh reports remote completed count, local ledger count, remote operations missing locally, local entries not present in the current remote result, pages fetched, and whether the safety page ceiling was reached.

A missing local UUID is repaired by the same refresh through ledger upsert.

## Fee model

QvaPay's POST /p2p/:uuid/received response provides gross_amount, fee and amount (net after fee). The ledger stores these values as grossAmountQusd, feeQusd and netAmountQusd when the scanner itself receives the completion response. Historical operations for which QvaPay has not supplied settlement fee data remain explicitly feeSource: unknown; the system does not invent a fee.

The finance summary continues to calculate FIFO realized profit from the P2P offer amounts. Known settlement fees are reported separately because fee denomination is QUSD while realized profit is expressed in fiat; silently converting the fee into fiat would introduce an unsupported valuation assumption.

## Idempotency

The ledger is keyed by P2P UUID. Re-importing the same completed operation does not create a duplicate entry. Existing recordedAt values are preserved. Settlement metadata can be attached later without creating a second operation.

## Historical limitations

The QvaPay P2P list endpoint exposes completed operations through pagination, while the P2P detail endpoint does not document settlement fee fields. Therefore old completed operations may legitimately have unknown fee metadata. The scanner distinguishes unknown from zero.

## Operational constraint

Finance synchronization uses the same centralized market-request scheduler as other authenticated P2P list reads, so a large historical reconciliation is intentionally paced to respect QvaPay's account-level query quota.
