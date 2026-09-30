# Security risk register — QvaPay AI Scanner

**Baseline:** 2026-09  
**Status:** Active  
**Scoring:** Probability and impact use Low / Medium / High / Critical. Risk level is a qualitative engineering assessment derived from those dimensions; it is not a mathematical probability.

## Risk register

| ID | Risk | Probability | Impact | Initial risk | Mitigation / control | Residual risk | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| R-01 | QvaPay app credentials exposed through browser or API response | Medium | Critical | Critical | Server-side credentials only; no app-secret in frontend contract | Low | Engineering | Controlled |
| R-02 | Unauthorized remote access to dashboard | Medium | Critical | Critical | Startup rejects non-loopback DASHBOARD_HOST | Low while local-only | Engineering | Controlled |
| R-03 | Sensitive operation invoked by unauthorized actor | Medium | Critical | Critical | Local-only deployment boundary; request validation; upstream QvaPay authorization | Low while local-only | Engineering | Controlled |
| R-04 | Market quota exhausted by duplicated collectors | Medium | High | High | MarketSnapshotService cache, deduplication, interval and 429 backoff | Low | Engineering | Controlled |
| R-05 | Auto-Apply performs excessive/unintended applications | Medium | Critical | Critical | Default-off, daily/concurrency/rate/amount limits, idempotency, VIP guard, no automatic settlement | Medium | Engineering | Open / monitor |
| R-06 | Operation action repeated after stale state | Medium | Critical | Critical | Operation refresh, QvaPay upstream state, explicit action mapping, validation tests | Medium | Engineering | Open / monitor |
| R-07 | Remote market failure produces false success | Medium | High | High | Explicit upstream error propagation and no fabricated success | Low | Engineering | Controlled |
| R-08 | Finance ledger loses or duplicates completed operations | Medium | High | High | Paginated sync, UUID deduplication, reconciliation, atomic persistence | Low | Engineering | Controlled |
| R-09 | Historical fee data unavailable | High | Medium | High | feeSource and null fee model; unknown state preserved | Low | Engineering | Controlled |
| R-10 | Unexpected upstream payload causes client-side injection | Medium | High | High | Escaping of rendered strings and separation of data from markup | Medium | Engineering | Open / monitor |
| R-11 | Local ledger/history files corrupted or deleted | Medium | High | High | Atomic writes; remote finance reconstruction; documented persistence boundary | Medium | Engineering | Open / monitor |
| R-12 | Dependency vulnerability or supply-chain issue | Medium | High | High | Lockfile, npm ci, CI quality gate, npm audit workflow | Medium | Engineering | Controlled / monitor |
| R-13 | Future remote deployment bypasses security prerequisites | Medium | Critical | Critical | Non-loopback bind rejected; remote mode explicitly requires new auth/security implementation | Low while enforced | Engineering | Controlled |
| R-14 | Workstation compromise exposes local secrets/files | Low/Unknown | Critical | High | Application cannot fully control OS compromise; credentials remain server-side | High | Operations | Open / external |
| R-15 | Real-QvaPay behavior differs from mocks/tests | Medium | High | High | Dedicated validation checkpoint #13; controlled real operation testing | Medium until #13 completes | Engineering | Open |

## Risk treatment rules

1. **Critical** risks cannot be accepted silently. They require a documented control or an explicit deployment restriction.
2. **High** risks require a mitigation owner and residual-risk statement.
3. A risk marked **Controlled** means the repository contains an implemented control; it does not mean the risk is impossible.
4. A risk marked **Open / monitor** must remain visible in future automation changes.
5. A new financial mutation requires an update to this register when its threat surface changes.
6. A change that relaxes the local-only trust boundary requires a full re-assessment of R-02, R-03, R-13 and related threats.

## Release gate

Before enabling higher-risk autonomous financial capabilities:

- no unmitigated Critical risk may remain;
- R-05 and R-06 require additional runtime evidence;
- R-15 requires completion of real-QvaPay validation;
- the threat model and risk register must be updated in the same change if the trust boundary or financial action model changes.
