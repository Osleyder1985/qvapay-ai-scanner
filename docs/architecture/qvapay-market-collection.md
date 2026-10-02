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

La política del colector asume que respuestas públicas consecutivas pueden estar cacheadas durante unos segundos; por eso acelerar el polling no se considera una garantía de mayor frescura.

## 429 behavior

A 429 is not cached. The collector extends its next available request time by at least 10 seconds. The upstream error is still returned to the caller so the caller can display/handle the failure.

## Architecture

Market, intelligence, history, Auto-Apply and operations listing now share the same market-request scheduler. User-specific `my=1` reads are paced by the same scheduler but are not treated as public-market cache data across different query keys.

## Event feed integration

QvaPay currently offers the P2P market feed through webhook or SSE. The arbitrage history module exposes a signed webhook ingestion boundary and a normalization contract for SSE events. The existing Cloudflare Worker does not keep a long-lived SSE connection open; reconciliation remains the recovery path for the authenticated operation history.

The feed is a paid QvaPay subscription. Its secret is represented by the runtime-only `QVAPAY_FEED_SECRET` binding and is never committed to source control.

## Verification target

The collector must remain the single path for market-list reads. New code must not call QvaPay `/p2p` directly without going through the service.