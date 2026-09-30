# Threat model — QvaPay AI Scanner

**Baseline:** 2026-09  
**Status:** Active  
**Scope:** dashboard web, backend Node.js/TypeScript, local persistence, QvaPay API integration and Auto-Apply.  
**Out of scope:** QvaPay infrastructure, the operating system as a whole, banking/fiat rails, and future remote-authentication infrastructure.

## 1. Security objectives

1. Keep QvaPay application credentials out of the browser.
2. Prevent unauthorized network access to sensitive backend routes while remote authentication is not implemented.
3. Prevent uncontrolled financial mutations.
4. Preserve integrity of operation and finance records.
5. Make upstream failures, rate limits and unknown financial data explicit rather than silently fabricating state.
6. Keep security controls fail-closed where a safe default is available.

## 2. Assets

| Asset | Description | Primary property | Consequence of compromise |
|---|---|---|---|
| A-01 | QvaPay app-id/app-secret | Backend credential used against QvaPay | Unauthorized API access / financial actions |
| A-02 | P2P operation state | Open, processing, paid, revision, completed, cancelled state | Incorrect or duplicated action |
| A-03 | Finance ledger | Local accounting/reconciliation data | Incorrect financial reporting |
| A-04 | Market observations | Current and historical P2P data | Incorrect decisions or stale analysis |
| A-05 | Auto-Apply configuration | Rules and limits for automatic application | Unintended applications |
| A-06 | Local persistence files | History, ledger and runtime state | Loss or tampering of evidence |
| A-07 | Browser session/runtime | UI state and operation controls | Unauthorized local actions if the workstation is compromised |

## 3. Trust boundaries

### TB-01 — Browser ↔ local backend

The browser is not trusted with QvaPay application credentials. Financial mutations pass through the backend.

### TB-02 — Local backend ↔ QvaPay

The backend authenticates to QvaPay with server-side application credentials and consumes QvaPay responses. Upstream responses are external input and must not be treated as local truth without validation.

### TB-03 — Backend ↔ local persistence

Finance/history data is persisted locally. Persistence is part of the application's evidence chain and must remain idempotent where records are re-imported.

### TB-04 — Workstation ↔ operating system

The application currently assumes a trusted local execution environment. OS compromise, malware, or direct filesystem access is outside the application's current security boundary.

## 4. Abuse cases / threats

| ID | Threat | Boundary | Impact | Likelihood | Existing controls | Residual |
|---|---|---|---|---|---|---|
| T-01 | App secret exposed to browser | TB-01 | Critical | Medium | Server-side QvaPay headers; secret never intentionally returned by API | Low |
| T-02 | Dashboard exposed on LAN/Internet without authentication | TB-01 | Critical | Medium | Fail-closed loopback host validation | Low while local-only boundary is enforced |
| T-03 | Unauthorized financial mutation from a remote client | TB-01 | Critical | Medium | Remote exposure blocked; sensitive routes remain behind local-only boundary | Low while local-only |
| T-04 | Duplicate upstream market requests cause quota exhaustion | TB-02 | High | Medium | Central MarketSnapshotService, cache, request deduplication, global interval, 429 backoff | Low |
| T-05 | Auto-Apply applies outside configured limits | TB-02 | Critical | Medium | Default-off, amount/rate/daily/concurrency limits, idempotency, VIP rejection guard, no automatic paid/received | Medium |
| T-06 | Auto-Apply interacts with VIP-only offer | TB-02 | High | Medium | VIP detection and cooldown/rejection memory | Low |
| T-07 | Repeated financial action after stale UI state | TB-01/TB-02 | Critical | Medium | QvaPay remains upstream authority; operation tracker refreshes state; action validation exists for request fields | Medium |
| T-08 | QvaPay 429 / upstream outage creates misleading local state | TB-02 | High | Medium | Explicit error propagation, central backoff, integration tests, no fabricated success | Low |
| T-09 | Finance ledger diverges from remote completed history | TB-02/TB-03 | High | Medium | Full completed-page reconciliation, idempotent upsert, missing/stale detection | Low |
| T-10 | Historical settlement fee is unknown | TB-02/TB-03 | Medium | High | Fee source and unknown state are explicit; no unsupported fiat valuation | Low |
| T-11 | Malicious/unexpected upstream data reaches HTML | TB-02/TB-01 | High | Medium | Frontend escaping helpers for rendered user/upstream strings; backend treats upstream payload as data | Medium |
| T-12 | Local persistence is corrupted or deleted | TB-03 | High | Medium | Atomic ledger persistence and reconstruction from QvaPay history for finance; historical market data remains local | Medium |
| T-13 | Dependency compromise or vulnerable dependency | Build boundary | High | Medium | package-lock.json, npm ci, CI quality gate, npm audit security workflow | Medium |
| T-14 | Future remote deployment occurs without required authentication/authorization | TB-01 | Critical | Medium | Architecture explicitly requires a separate security implementation; host validation rejects non-loopback today | Low while control remains enforced |
| T-15 | Local workstation compromise exposes credentials | TB-04 | Critical | Low/unknown | Credentials remain server-side and deployment is local-only | High / outside current application control |

## 5. STRIDE mapping

| Threat class | Relevant examples |
|---|---|
| Spoofing | T-02, T-03, T-14 |
| Tampering | T-07, T-09, T-12 |
| Repudiation | T-09, T-12 |
| Information disclosure | T-01, T-15 |
| Denial of service | T-04, T-08, T-13 |
| Elevation of privilege | T-02, T-03, T-05, T-14 |

## 6. Security decisions

### SD-01 — Local-only is a hard boundary

Until explicit authentication and authorization exist, non-loopback binding is rejected. This is a deployment security control, not a substitute for future application authentication.

### SD-02 — No automatic settlement

Auto-Apply may apply to an eligible P2P offer, but it does not automatically mark the operation paid, received, cancelled, or rated.

### SD-03 — Unknown is a valid state

The system must preserve unknown fee/cost/identity information rather than inventing a value.

### SD-04 — QvaPay remains the operation authority

Local UI state, cached observations and local persistence do not become proof that a remote operation succeeded. Mutation responses and subsequent remote state are authoritative for QvaPay operations.

### SD-05 — Centralize upstream market consumption

Market reads must use the central collection service so independent features do not each consume the upstream quota.

## 7. Required controls before remote exposure

The local-only boundary must not be relaxed until all of the following exist and are tested:

- authentication;
- authorization;
- session/token lifecycle;
- CSRF protection where applicable;
- audit logging for sensitive actions;
- secret rotation procedure;
- security tests for authorization bypass;
- explicit deployment configuration and threat-model update.

## 8. Verification status

This document records the security model and repository controls. It does not claim that every residual risk has been eliminated. Real-QvaPay acceptance remains tracked separately in issue #13.
