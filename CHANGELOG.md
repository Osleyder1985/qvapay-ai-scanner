# Changelog

## 2026-10-02 — Server-side arbitrage monitor

### Integrated

- PR #156 merged into production/cloudflare.
- Merge commit: d99cba3265a6ac6c27cb07430a140316cc51cd22.
- Arbitrage scanning moved from browser-driven execution to a persistent Cloudflare Durable Object.
- Durable Object Alarm schedules approximately 10-second scan cycles.
- Cloudflare Cron runs at minute granularity only to bootstrap/ensure the monitor is started.
- D1 migration 0006_arbitrage_monitor.sql adds persistent monitor configuration and state.
- Default configuration: 24/7, BANK_CUP, minimum margin 5%.
- Market opportunities remain isolated by coin.
- The UI displays all current SELL offers for the selected coin and calculates purchase rate, required capital, target sale rate, projected return, gross profit and gross margin.
- The frontend no longer drives market scanning; it consumes the persisted server snapshot.
- The visible 10 → 0 countdown is presentation-only.
- Transient market errors preserve the last valid snapshot and record the error.
- The monitor is explicitly read-only and does not execute QvaPay order mutations.

### Verification

- CI quality: success.
- Cloudflare runtime smoke: success.
- Security workflow: success.
- Cloudflare deployment workflow: success.
- Deployment verification step: success.
- Production deployment was performed from merge commit d99cba3265a6ac6c27cb07430a140316cc51cd22.

### Documentation

Updated:

- docs/arbitrage-scanner.md
- docs/architecture/arbitrage-module.md
- docs/cloudflare/d1-schema.md
- docs/cloudflare/d1-persistence.md
- architecture/architecture-overview.md

### Known scope

- The public API/UI does not yet expose the schedule fields for custom days, local start/end time and timezone.
- The monitor persists the latest snapshot rather than a complete 10-second historical series.
- Coverage is bounded by the configured QvaPay pagination limit and reports truncation when applicable.
