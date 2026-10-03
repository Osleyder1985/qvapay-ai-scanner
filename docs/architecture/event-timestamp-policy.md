# Event Timestamp and Clock-Skew Policy

## Purpose

Market-event analytics must remain deterministic when upstream systems, webhook delivery, reconciliation jobs, or local clocks disagree about time.

## Policy

- The canonical event time is `eventAt`, selected from the source event timestamp, then the state update timestamp, then the creation timestamp.
- `observedAt` is the ingestion/observation time assigned by this system.
- A future `eventAt` up to **5 minutes** after `observedAt` is accepted. This tolerance covers ordinary clock drift and delivery metadata skew.
- A future `eventAt` more than **5 minutes** after `observedAt` is classified as `future_skew` and quarantined from lifecycle reconstruction and analytics windows.
- Quarantined events are persisted with their original source timestamps and remain available for audit/reconciliation.
- Source timestamp text is retained separately from normalized ISO timestamps so normalization never destroys traceability.
- If `eventAt` is malformed, the normalizer deterministically falls back to `updatedAt`, then `createdAt`. If no usable timestamp exists, the event is rejected.
- If `observedAt` is malformed or missing, the ingestion clock (`now`) is used.
- Negative completion durations are never included in completion-time statistics.
- The policy is applied before lifecycle ordering and analytics window selection, so future-dated events cannot move the active window or freshness watermark.

## Observability

Normalized events expose:

- `timestampQuality`: `valid` or `future_skew`.
- `quarantined`: whether the event is excluded from lifecycle analytics.
- `sourceEventAt` and `sourceObservedAt`: original source timestamp values.
- Lifecycle reconciliation exposes quarantined events separately from accepted canonical events.

The D1 `market_events` table persists these fields for auditability.

## Rationale

A fixed tolerance makes the behavior deterministic and testable. Quarantine is preferred to silently clamping a source timestamp because clamping would alter historical evidence and could hide upstream clock defects.
