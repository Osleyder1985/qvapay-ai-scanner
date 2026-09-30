# Acceptance Criteria

**Baseline:** 1.0  
**Status:** Active

The following criteria define the minimum evidence required for the current engineering baseline. They are not a claim that every item has already been executed successfully in the user's environment.

## A. Market

- **AC-001:** A valid market read returns offers or a documented controlled error.
- **AC-002:** Concurrent identical market reads are deduplicated and successful responses are served from the central cache during its cache window.
- **AC-003:** A QvaPay 429 produces backoff telemetry and does not create a tight retry loop.

## B. P2P operations

- **AC-004:** A valid application is sent through the backend without exposing app credentials.
- **AC-005:** An active operation can be retrieved and refreshed until terminal state.
- **AC-006:** Paid/received/cancel/chat/rate operations are subject to role/state validation.
- **AC-007:** Malformed or unauthorized sensitive operation requests are rejected.

## C. Finance

- **AC-008:** Completed P2P history is paginated and not limited to the first 100 records.
- **AC-009:** Remote and local completed IDs can be reconciled.
- **AC-010:** Settlement fee/gross/net metadata is persisted when supplied by QvaPay.
- **AC-011:** Missing historical fee information remains unknown and does not become a fabricated zero.
- **AC-012:** Repeated synchronization is idempotent.

## D. Auto-Apply

- **AC-013:** Auto-Apply is disabled by default.
- **AC-014:** Matching enforces configured amount/rate/daily/concurrency limits.
- **AC-015:** VIP-only offers are excluded/rejected with cooldown protection.
- **AC-016:** 429 responses pause or back off Auto-Apply rather than causing uncontrolled retries.

## E. Security and delivery

- **AC-017:** The dashboard refuses non-loopback host configuration.
- **AC-018:** Credentials are backend-only.
- **AC-019:** `npm ci`, type checking, formatting and tests are defined as repository quality gates.
- **AC-020:** Integration/E2E tests cover health, market read, controlled apply, operation tracking, sensitive validation, 429, finance reconciliation, persistence recovery and timeout handling.

## Verification status

Execution status is recorded in the traceability matrix. A test being implemented is not equivalent to a test having passed in the user's runtime environment.
