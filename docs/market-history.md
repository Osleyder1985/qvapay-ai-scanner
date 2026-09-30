# Market History

## Purpose

The scanner persists lightweight market observations so analytics can distinguish a current snapshot from an observed trend.

## Storage

The first implementation uses a local JSON file:

`data/market-history.json`

The file is runtime state and must not be committed. The path can be changed with `MARKET_HISTORY_PATH`.

Each observation is aggregated by `coin + type` and stores:

- timestamp
- sample count
- minimum effective rate
- median effective rate
- maximum effective rate
- spread

The effective rate is:

`receive / amount`

## Collection

The backend performs one collection at startup and then every 60 seconds.

The collector requests at most 100 current P2P offers. It stores aggregates rather than every individual offer to keep the initial implementation lightweight.

The default retention is 10,000 aggregate points and can be changed in code through the history-store configuration.

## API

`GET /api/history`

Optional query parameters:

- `coin`
- `type`
- `limit` (maximum 1000 per request)

This is an initial persistence layer. PostgreSQL remains a later evolution when historical volume, concurrent users, or analytical requirements justify it.

## Important limitation

A trend is not statistically meaningful immediately after activation. The system must accumulate observations first. The UI therefore distinguishes the historical layer from the current snapshot and does not manufacture missing history.

## Trend engine

`GET /api/trends` groups historical observations by coin and type and calculates the first/last observed median, absolute change, percentage change, observed median range, and direction. Direction is descriptive (`up`, `down`, `flat`) and is not a prediction. A group with no valid median observations is reported as `insufficient`.

The UI presents these measurements only after observations exist; it does not extrapolate future prices or claim predictive accuracy.
