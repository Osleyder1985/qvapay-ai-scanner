# Market event history and execution analytics

## Purpose

This module records observed QvaPay P2P lifecycle events and derives execution statistics independently for each currency.

The historical window is a **view**, not the storage limit. The default analytical window is the latest 100 completed operations per coin.

## Lifecycle

Only explicit lifecycle events are accepted:

- `created`
- `reopened`
- `applied`
- `paid`
- `completed`
- `cancelled`

An offer disappearing from the current market is never treated as a completed trade by inference.

## Event provenance

Every normalized event retains:

- QvaPay offer UUID;
- optional event ID;
- source (`stream`, `webhook`, `reconciliation`);
- event timestamp;
- local observation timestamp;
- coin;
- side/type;
- amount and receive when available;
- derived rate when both amount and receive are valid.

The source and timestamps are required for later reconciliation and latency analysis.

## Analytics

For each currency, the deterministic analytics layer exposes:

- minimum/maximum executed rate;
- arithmetic mean;
- median;
- p10/p25/p50/p75/p90;
- VWAP weighted by QUSD quantity;
- traded QUSD volume;
- completion/cancellation rates over observed terminal offers;
- average time from `created` to `completed`;
- newest event/observation timestamps;
- stale-data flag.

The default completed-trade window is 100 operations. A different window can be requested without deleting older records.

## Data integrity

Events are deduplicated by a stable key. An identical lifecycle event observed through SSE and webhook therefore does not create a second analytical trade.

Incomplete lifecycle states are not executions. Only an explicit `completed` event with valid amount, receive and rate contributes to completed-trade statistics.

## Limits

This module does not:

- create, apply, cancel, or reprice QvaPay offers;
- infer profitability;
- choose a buy/sell price;
- mix currencies;
- use AI to decide execution.

It is an evidence layer for the later price-selection and inventory-backed market-making strategies.
