# Requirements Traceability Matrix

**Baseline:** 1.0  
**Status:** Active  
**Verification convention:** `Implemented` means repository evidence exists; `Verified` is reserved for an executed verification result that is actually known. Where execution has not been independently observed, the matrix records that limitation.

| Req. | Architecture / decision | Implementation | Verification evidence | Status |
|---|---|---|---|---|
| FR-001 | Modular monolith; central market collection | `src/backend/server.ts`, `src/backend/market-snapshot.ts` | `src/tests/backend-integration.test.ts`, market snapshot tests | Implemented; runtime pass not independently re-observed after latest merge |
| FR-002 | Dashboard market feature | `src/frontend/app.js` | Existing market UI behavior/tests | Implemented |
| FR-003 | Backend-only QvaPay integration | `src/backend/server.ts` | Integration apply test | Implemented |
| FR-004 | Operation tracker | `src/backend/server.ts`, frontend operation tracker | Integration operation tracking test | Implemented |
| FR-005 | Operations center | `src/backend/operations.ts`, `src/backend/server.ts` | Integration coverage + unit tests | Implemented |
| FR-006 | Role/state action mapping | `src/backend/operations.ts`, operation routes in `server.ts` | Sensitive operation integration tests | Implemented |
| FR-007 | Historical analytics | `src/backend/market-history.ts`, `trend-engine.ts`, `market-baseline.ts` | Related unit tests | Implemented |
| FR-008 | Auto-Apply engine and safety controls | `src/backend/auto-apply.ts`, `config/auto-apply.default.json` | Auto-Apply unit tests | Implemented |
| FR-009 | Finance ledger | `src/backend/finance-ledger.ts`, `finance-reconciliation.ts` | Finance unit/integration tests | Implemented |
| FR-010 | Account snapshot | `src/backend/account.ts`, account route in `server.ts` | Account-related tests where present | Implemented; identity availability remains explicit |
| FR-011 | Dashboard app shell | `src/frontend/app.js`, frontend assets | Build/integration baseline | Implemented |

| Req. | Architecture / decision | Implementation | Verification evidence | Status |
|---|---|---|---|---|
| NFR-001 | Strict TypeScript configuration | `tsconfig.json` | CI `npm run lint` gate | Implemented |
| NFR-002 | Conservative QvaPay market quota | Central collection design | `src/tests/market-snapshot.test.ts` | Implemented |
| NFR-003 | Single market collection service | `src/backend/market-snapshot.ts` | Market snapshot tests + routing review | Implemented |
| NFR-004 | Local-only trust boundary | ADR-003 / dashboard trust boundary | `src/tests/dashboard-security.test.ts` | Implemented |
| NFR-005 | Idempotent persistence | Finance ledger | Finance tests | Implemented |
| NFR-006 | Reproducible quality gates | CI workflow + lockfile | `.github/workflows/ci.yml` | Implemented; GitHub run result not independently observed |
| NFR-007 | Configurable upstream timeout | Backend integration configuration | `backend-integration.test.ts` | Implemented |
| NFR-008 | Responsive application shell | Frontend architecture | Integration/build baseline | Implemented |
| NFR-009 | Evidence-first unknown states | Finance/account/intelligence models | Code/documentation review | Implemented |

| Req. | Architecture / decision | Implementation | Verification evidence | Status |
|---|---|---|---|---|
| SEC-001 | Backend credential boundary | `src/backend/server.ts`, `config/.env.example` | Integration/security review | Implemented |
| SEC-002 | Local-only deployment boundary | `src/backend/dashboard-security.ts` | `dashboard-security.test.ts` | Implemented |
| SEC-003 | Role/state validation | `src/backend/operations.ts` | Integration sensitive-route test | Implemented |
| SEC-004 | Default-off bounded automation | `src/backend/auto-apply.ts` | Auto-Apply tests | Implemented |
| SEC-005 | VIP safety guard | `src/backend/auto-apply.ts` | VIP regression tests | Implemented |
| SEC-006 | Central 429 backoff | `src/backend/market-snapshot.ts` | 429 market snapshot test | Implemented |
| SEC-007 | Sensitive route validation | `src/backend/server.ts` | Backend integration tests | Implemented |
| SEC-008 | Reproducible dependency security gate | `.github/workflows/security.yml`, `package-lock.json` | Workflow definition | Implemented; GitHub run result not independently observed |

| Req. | Architecture / decision | Implementation | Verification evidence | Status |
|---|---|---|---|---|
| FIN-001 | Paginated finance source-of-truth sync | `src/backend/finance-reconciliation.ts`, `server.ts` | Finance pagination tests | Implemented |
| FIN-002 | Remote/local reconciliation | `finance-reconciliation.ts` | Finance reconciliation tests | Implemented |
| FIN-003 | Fee-aware settlement metadata | `finance-ledger.ts`, received route | Finance tests | Implemented |
| FIN-004 | Unknown historical fees | `finance-ledger.ts` migration/model | Finance tests | Implemented |
| FIN-005 | No unsupported fiat fee valuation | Finance model | Finance documentation/code review | Implemented |
| INT-001 | QvaPay API integration | `src/backend/server.ts` | Backend integration market test | Implemented |
| INT-002 | Backend mutation proxy | `src/backend/server.ts` | Apply/action integration tests | Implemented |
| INT-003 | Controlled upstream errors | Backend request layer | 429 + timeout integration tests | Implemented |
| INT-004 | QvaPay UUID identity | Operation/finance layers | Operation and finance tests | Implemented |

## Baseline limitations

- This matrix records repository-level evidence; it does not replace a real-QvaPay acceptance run.
- The repository has integration/E2E tests, but their latest post-merge execution has not been independently observed in this audit environment.
- CI workflows are present, but no successful GitHub Actions run is claimed unless a run result is explicitly observed.
- Requirements are intentionally limited to capabilities evidenced by the current implementation; future AI/ML, alerts and autonomous trading capabilities are not promoted to baseline requirements until separately specified and validated.
