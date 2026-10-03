# Cross-layer reconciliation diagnostics

## Purpose

The reconciliation report is read-only evidence. It does not create, delete, settle, or repair financial records automatically.

The canonical cross-layer identity is the QvaPay P2P UUID, represented as `offerUuid` in market events and `uuid` in operation and finance records.

## Discrepancy categories

| Category | Meaning |
|---|---|
| `event_missing_operation` | A canonical completed market event has no durable operation with the same UUID. |
| `operation_missing_event` | A completed durable operation has no canonical completed market event. |
| `operation_missing_finance` | A completed durable operation has no finance settlement entry. |
| `finance_missing_operation` | A completed finance entry has no completed operation with the same UUID. |
| `market_history_unmatched_event` | A completed event has no market-history observation for the same coin/type within the matching window. |
| `stale_lifecycle` | The newest non-terminal lifecycle event is older than the configured stale threshold without a terminal event. |
| `duplicate_identity` | More than one source record uses the same canonical identity in the reconciliation input. |
| `conflicting_identity` | A durable operation UUID conflicts with its embedded upstream UUID/id. |

Every discrepancy contains:

- `category`: machine-readable classification;
- `identity`: canonical identity used for correlation;
- `sourceIds`: source identifiers retained for investigation;
- `timestamps`: source/observation timestamps that explain the finding.

## Determinism and idempotency

The report sorts identities and discrepancy records and does not mutate any source layer. Running the same input repeatedly produces the same report. Input ordering does not change the result.

Quarantined future-skew events are excluded from canonical reconciliation. Their source evidence remains persisted separately by the event timestamp policy.

## False-positive boundaries

- Market history is aggregate coverage evidence, not a one-row foreign-key counterpart. A missing market-history match is therefore diagnostic evidence, not proof that an operation is invalid.
- A non-terminal event is only classified as stale after the configured threshold; legitimate long-running operations remain observable rather than being silently converted to terminal states.
- Duplicate and conflicting identities are reported without choosing a winner or rewriting source data.

## API

`GET /api/arbitrage/reconciliation` returns the deterministic report. An optional `coin` parameter scopes the report to one currency.

The diagnostic endpoint is read-only. Production repair remains an explicit operational action outside this report.
