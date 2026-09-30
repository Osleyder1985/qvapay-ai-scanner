# Operations history reconciliation

## Objective

The Operations Center must not depend on a single QvaPay page. The backend reconstructs the available `my=1` operation history by following QvaPay pagination up to a safety ceiling.

## Synchronization model

1. Request page 1 with `my=1&take=100&sortByStatus=true`.
2. Read `total` and `per_page` from the response.
3. Continue through every required page until the remote last page is reached.
4. Stop and report `truncated=true` if the safety ceiling of 100 pages would be exceeded.
5. Persist the complete remote snapshot only after all requested pages have succeeded.
6. Upsert by QvaPay operation UUID so repeated synchronization is idempotent.
7. Return remote pagination metadata and reconciliation data to the frontend.
8. On process restart, load the local ledger before the next synchronization.

## Persistence

The default ledger is:

`data/operations-ledger.json`

The path can be overridden with:

`OPERATIONS_LEDGER_PATH`

Writes are atomic: data is written to a temporary file and renamed into place.

Each record preserves:

- QvaPay UUID;
- current remote operation fields;
- `recordedAt` — first local observation;
- `lastSeenAt` — latest successful synchronization observation.

## Reconciliation

The response exposes:

- `remoteCount`;
- `ledgerCount`;
- `missingInLedger`;
- `staleLocal`.

A successful full synchronization should normally have an empty `missingInLedger`. A non-empty `staleLocal` is not automatically an error: QvaPay may stop returning historical records under a future API retention/filter policy, so the local ledger preserves evidence instead of deleting it.

## Failure semantics

If any required upstream page fails, the synchronization request fails and the existing local ledger is not replaced by a partial snapshot.

This prevents a transient upstream failure from being interpreted as a complete history.

## API compatibility

`GET /api/operations` retains the `operations.data` collection but now includes:

- `total`;
- `per_page`;
- `page`;
- `pages_fetched`;
- `truncated`;
- `source`;
- `persistence`;
- `reconciliation`.

This is a backend contract expansion; existing frontend operation records remain under `operations.data`.

## Verification

Coverage includes:

- UUID deduplication;
- preservation of first-observed timestamp;
- missing/stale reconciliation;
- multi-page integration synchronization;
- persistence and recovery after dashboard restart.

Real-QvaPay validation remains part of checkpoint #13.
