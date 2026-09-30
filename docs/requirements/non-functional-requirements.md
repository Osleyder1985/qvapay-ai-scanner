# Non-Functional Requirements

**Baseline:** 1.0  
**Status:** Active

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| NFR-001 | The backend shall use strict TypeScript checks. | Critical | The TypeScript compiler runs with the repository's strict configuration and no type errors. |
| NFR-002 | Market collection shall respect the conservative QvaPay query budget adopted by the project. | Critical | Central collection enforces cache, request deduplication, minimum interval and 429 backoff. |
| NFR-003 | Upstream market reads shall be centralized rather than independently issuing duplicate market-list requests from each feature. | Critical | Market, intelligence, history, Auto-Apply and related market reads use the central collection service. |
| NFR-004 | The application shall fail closed when the dashboard host violates the local-only deployment boundary. | Critical | A non-loopback dashboard host prevents startup. |
| NFR-005 | Financial and operation persistence shall be idempotent for the same remote P2P UUID. | Critical | Re-importing or receiving the same operation does not create duplicate ledger records. |
| NFR-006 | The repository shall provide reproducible dependency installation and automated quality gates. | High | A committed npm lockfile and CI workflow execute install, type check, formatting and tests. |
| NFR-007 | Upstream requests shall have a configurable timeout. | High | A configured timeout aborts an unresponsive QvaPay request and produces a controlled error path. |
| NFR-008 | The dashboard shall remain responsive across mobile and desktop layouts. | High | Core navigation and critical workflows remain usable on supported responsive breakpoints. |
| NFR-009 | The project shall distinguish verified capabilities from assumptions and unavailable data. | Critical | Documentation and API responses expose explicit unknown/unavailable states where evidence is insufficient. |
