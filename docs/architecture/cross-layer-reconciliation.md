# Cross-Layer Reconciliation

## Canonical identity

`QvaPay P2P uuid` is the canonical operation identity. The same value is represented as `offer_uuid` in `market_events`, `uuid` in `operations_ledger`, and `uuid` in `finance_ledger`.

`market_history` is intentionally different: it is an aggregate market-observation table, not a one-row-per-operation ledger. It is therefore reconciled as time/coin/type coverage evidence rather than as a strict foreign-key counterpart.

## Reconciliation flow

1. Read canonical market events and exclude timestamp-quarantined observations from analytical convergence.
2. Read durable operation payloads from `operations_ledger`.
3. Read completed finance entries from `finance_ledger`.
4. Compare completed event UUIDs with operation UUIDs.
5. Compare completed operation UUIDs with finance UUIDs.
6. Compare completed event timestamps with market-history observations for the same coin and side within a five-minute evidence window.
7. Emit deterministic sorted mismatch sets; do not mutate any layer.

## Consistency boundaries

- `market_events` is the lifecycle evidence layer.
- `operations_ledger` is the durable upstream-operation snapshot layer.
- `finance_ledger` is the completed-settlement layer.
- `market_history` is aggregate market evidence.

A reconciliation run is idempotent because it is read-only and derives the same report from the same persisted inputs regardless of input order.

## Recovery

Missing counterparts are retained as diagnostics rather than fabricated. A later webhook, reconciliation pass, or finance settlement can close the gap through the existing idempotent upsert paths. No reconciliation process invents a completed or financial record from absence alone.

The diagnostic endpoint is `GET /api/arbitrage/reconciliation` with an optional `coin` parameter.
