# QvaPay market collection policy

## Current strategy

All market-list GET requests made by the application pass through `MarketSnapshotService`.

The service provides:
- response caching for 2.5 seconds;
- concurrent-request deduplication;
- a global 2.6-second minimum interval between upstream market-list requests;
- fail-safe handling of HTTP 429 responses;
- telemetry for cache and upstream activity.

At 2.6 seconds between upstream requests, the theoretical continuous rate is about 23 requests/minute, below QvaPay's current documented 25 queries/minute per account. QvaPay's list documentation also contains a contradictory 429 table mentioning 30/60 seconds; the implementation deliberately uses the more conservative 25/minute limit.

QvaPay states that public market-list responses are cached server-side for a few seconds, so polling faster does not necessarily produce fresher data. citeturn0search2

## 429 behavior

A 429 is not cached. The collector extends its next available request time by at least 10 seconds. The upstream error is still returned to the caller so the caller can display/handle the failure.

## Architecture

Market, intelligence, history, Auto-Apply and operations listing now share the same market-request scheduler. User-specific `my=1` reads are paced by the same scheduler but are not treated as public-market cache data across different query keys.

## Future feed

QvaPay currently offers a paid market feed through webhook or SSE for $10/30 days. Webhook provides queued delivery/retries; SSE is live but can lose events while disconnected. Neither is a dependency of the current architecture.

## Verification target

The collector must remain the single path for market-list reads. New code must not call QvaPay `/p2p` directly without going through the service.