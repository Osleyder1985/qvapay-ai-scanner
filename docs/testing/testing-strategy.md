# Testing strategy

## Purpose

The project uses three complementary test levels:

| Level | Purpose | External QvaPay |
|---|---|---|
| Unit | Pure business rules and deterministic modules | No |
| Integration | Backend routes and persistence boundaries | Mocked |
| E2E | User-critical HTTP flow through the real dashboard process | Mocked |

The integration/E2E suite is deliberately offline: it never sends credentials or requests to the real QvaPay service.

## Automated critical paths

src/tests/backend-integration.test.ts starts:

1. a local HTTP mock that emulates the QvaPay endpoints used by the dashboard;
2. the compiled dashboard as a child process with isolated temporary persistence;
3. real HTTP requests against the dashboard.

The suite covers:

- health endpoint;
- market read through /api/p2p;
- controlled application through POST /api/p2p/:uuid/apply;
- operation tracking through GET /api/p2p/:uuid;
- sensitive input validation for tx_id;
- upstream HTTP 429 propagation;
- paginated finance reconciliation;
- persistence and recovery after restarting the dashboard;
- upstream timeout handling.

## Test data isolation

Each E2E test uses a temporary directory for FINANCE_LEDGER_PATH, MARKET_HISTORY_PATH and AUTO_APPLY_CONFIG_PATH. No project data/ file is modified by the suite.

## Failure semantics

The tests verify that:

- an upstream 429 remains observable as an HTTP 429;
- an upstream timeout is translated to the dashboard's controlled 502 response;
- invalid financial input is rejected before an upstream request;
- persisted finance entries survive a dashboard process restart.

## Running

The repository test command builds TypeScript first and then executes all compiled tests:

    npm test

The timeout scenario intentionally exercises the production 20-second QvaPay request timeout and therefore makes the full suite longer than unit-only execution.

## Real-QvaPay validation

These tests prove the dashboard boundary and critical behavior without depending on QvaPay availability or credentials. They do not replace the manual validation checkpoint for real QvaPay behavior tracked separately in issue #13.
