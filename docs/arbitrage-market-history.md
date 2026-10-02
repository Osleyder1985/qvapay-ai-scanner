# Market event history and execution analytics

## Purpose

This module records observed QvaPay P2P lifecycle events and derives execution statistics independently for each currency.

The historical window is a **view**, not the storage limit. The default analytical window is the latest 500 completed operations per coin. Price statistics use the completed operations present in that terminal window.

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

## Ingestion

### Webhook

The Worker exposes:

`POST /api/arbitrage/webhook`

The endpoint is intentionally outside dashboard-session authentication because QvaPay cannot authenticate with the local dashboard session. It instead requires:

- `x-qvapay-signature` with HMAC-SHA256 of the raw request body;
- `x-qvapay-timestamp` within a five-minute replay window;
- the server-side `QVAPAY_FEED_SECRET`.

The webhook is idempotent through the event/offer identity persisted in `market_events`.

### Reconciliation

The authenticated endpoint:

`POST /api/arbitrage/reconcile`

reuses the existing paginated `GET /p2p?my=1` operation source. It writes explicit lifecycle observations for `open`, `processing`, `paid`, `completed`, and `cancelled`. Unsupported states such as `revision` are counted and are never silently converted to `completed`.

Reconciliation is a recovery path, not a substitute for the real-time feed. La integración considera el webhook y el stream como fuentes de baja latencia; la reconciliación queda como vía de recuperación.

### Stream

The normalization contract also accepts `stream` events. The QvaPay SSE feed has the same lifecycle payload as the webhook. A long-lived SSE consumer is not embedded in the Cloudflare request handler because the stream is a continuous connection and Cloudflare Worker requests are not a durable process boundary.

## Analytics

For each currency, the deterministic analytics layer exposes:

- minimum/maximum executed rate;
- arithmetic mean;
- median;
- p10/p25/p50/p75/p90;
- VWAP weighted by QUSD quantity;
- traded QUSD volume;
- completion rate for the selected completed-operation window; cancellation rate is intentionally not calculated because cancelled operations are excluded from the sample;
- average time from `created` to `completed`;
- newest event/observation timestamps;
- stale-data flag.

The default completed-trade window is 500 valid completed operations. A different window can be requested without deleting older records. Cancelled or otherwise unexecuted offers do not consume positions in this window.

## Data integrity

Events are deduplicated by a stable event/offer identity. An identical lifecycle event observed through SSE and webhook therefore does not create a second analytical trade.

Incomplete lifecycle states are not executions. Only an explicit `completed` event with valid amount, receive and rate contributes to completed-trade statistics.

## External feed dependency

QvaPay currently documents the market webhook/SSE feed as a paid subscription. The application keeps the integration boundary available without embedding the subscription cost or any feed secret in source control.

## Limits

This module does not:

- create, apply, cancel, or reprice QvaPay offers;
- infer profitability;
- choose a buy/sell price;
- mix currencies;
- use AI to decide execution.

It is an evidence layer for the later price-selection and inventory-backed market-making strategies.
