# Threat model — QvaPay AI Scanner

**Baseline:** 2026-10-03  
**Status:** Active

## Security model

The Cloudflare Worker is the primary application security boundary. QvaPay credentials remain server-side. Private API routes require a D1-backed session. Browser state-changing requests require a matching Origin. QvaPay remains authoritative for operation-level permissions and operation state.

## Trust boundaries and control ownership

| Control | Worker responsibility | Cloudflare / external responsibility | Evidence |
|---|---|---|---|
| Application authentication | Validate AUTH_USERNAME + AUTH_PASSWORD; issue D1-backed session | Store production secret values | src/cloudflare/auth-routes.ts, src/cloudflare/access.ts |
| Authorization | One configured application identity; no multi-role model | QvaPay enforces operation-level role/state rules | src/cloudflare/cloudflare-router.ts, operation handlers |
| Perimeter protection | Reject unauthenticated private API access | Worker route/hostname, WAF/Access/edge controls are defense-in-depth | Production deployment evidence + Cloudflare account procedure |
| CSRF / same-origin | Require explicit matching Origin on POST/PUT/PATCH/DELETE | Browser/platform supplies Origin semantics | src/cloudflare/access.ts, src/cloudflare/cloudflare-router.ts |
| Session expiry | Seven-day TTL; reject expired sessions | D1 durability | src/cloudflare/access.ts |
| Session revocation | Delete token hash on logout/expiry | D1 durability | destroySession(), session tests |
| Login rate limiting | Five failed attempts per 15-minute key window; D1-backed | Cloudflare edge limits may add defense-in-depth | src/cloudflare/auth-rate-limit.ts |
| Credential recovery | No self-service reset endpoint; operator rotates the Cloudflare secret | Cloudflare secret management / operator identity | CI secret-binding verification; operator procedure |
| Signed feed ingestion | HMAC-SHA-256 + timestamp freshness + bounded body | Secret storage and webhook delivery configuration | src/cloudflare/arbitrage-event-ingestion.ts |
| AI Auditor | Token-hash authentication; GET-only diagnostic surface; response allowlists | Store auditor secret and restrict caller distribution | src/cloudflare/ai-audit-auth.ts, src/cloudflare/ai-audit-routes.ts |
| Auto-Apply | Cloudflare implementation is fail-closed: config writes return 501 and scheduled execution is disabled | No external control may enable a capability absent from the Worker | src/cloudflare/auto-apply-routes.ts |

A single configured application identity currently operates the dashboard; there is no multi-user role model.

## Complete API security inventory

routeRequest() applies the session gate to every /api/* request except the explicit public/authentication boundaries listed below. The same-origin gate applies to every POST/PUT/PATCH/DELETE except those same explicit boundaries.

| Route | Method | Session | Additional authorization / integrity | Mutation |
|---|---|---:|---|---:|
| /api/health | GET | No | None; liveness only | No |
| /api/auth/login | POST | No | Same-origin + configured credentials + rate limit | Yes, session creation |
| /api/auth/logout | POST | No | Same-origin; revokes presented session | Yes |
| /api/auth/session | GET | Yes (handler-level) | D1 session validity | No |
| /api/ai-audit/health | GET | No | AI Auditor token hash | No |
| /api/ai-audit/monitor | GET | No | AI Auditor token hash; read-only | No |
| /api/ai-audit/arbitrage | GET | No | AI Auditor token hash; read-only + field allowlist | No |
| /api/ai-audit/database | GET | No | AI Auditor token hash; read-only | No |
| /api/ai-audit/runtime | GET | No | AI Auditor token hash; read-only | No |
| /api/arbitrage/webhook | POST | No | HMAC signature + timestamp freshness + body limit | Yes, event ingestion |
| /api/cloudflare/d1/health | GET | Yes | Session gate | No |
| /api/market/snapshot | GET | Yes | Session gate | No |
| /api/p2p | GET | Yes | QvaPay backend credentials | No |
| /api/p2p/{uuid} | GET | Yes | UUID validation + QvaPay authorization | No |
| /api/p2p/{uuid}/apply | POST | Yes | Same-origin + QvaPay operation authorization | Yes, financial |
| /api/intelligence | GET | Yes | QvaPay backend credentials | No |
| /api/history | GET | Yes | D1 | No |
| /api/trends | GET | Yes | D1 | No |
| /api/baselines | GET | Yes | D1 | No |
| /api/operations | GET | Yes | my=1 at QvaPay | No |
| /api/operations/{uuid}/chat | GET | Yes | UUID + QvaPay operation authorization | No |
| /api/operations/{uuid}/chat | POST | Yes | Same-origin + input validation + QvaPay authorization | Yes |
| /api/operations/{uuid}/paid | POST | Yes | Same-origin + tx_id validation + QvaPay authorization | Yes, financial |
| /api/operations/{uuid}/received | POST | Yes | Same-origin + QvaPay authorization | Yes, financial |
| /api/operations/{uuid}/cancel | POST | Yes | Same-origin + QvaPay authorization | Yes, financial |
| /api/operations/{uuid}/rate | POST | Yes | Same-origin + rating validation + QvaPay authorization | Yes |
| /api/account | GET | Yes | QvaPay backend credentials | No |
| /api/qvapay/info | GET | Yes | QvaPay backend credentials | No |
| /api/finance | GET | Yes | D1 + QvaPay backend credentials | No |
| /api/auto-apply/config | GET | Yes | Fixed disabled configuration in Cloudflare | No |
| /api/auto-apply/config | PUT/PATCH | Yes | Same-origin; fail-closed 501 | No effective mutation |
| /api/auto-apply/status | GET | Yes | Fixed disabled runtime state | No |
| /api/arbitrage/scan | GET | Yes | Read-only; execution hard-disabled | No |
| /api/arbitrage/history | GET | Yes | D1 analytics | No |
| /api/arbitrage/reconciliation | GET | Yes | D1 reconciliation | No |
| /api/arbitrage/reconcile | POST | Yes | Same-origin + deterministic reconciliation; no financial mutation | Yes, persistence |
| /api/arbitrage/monitor | GET | Yes | Read-only monitor state | No |
| /api/arbitrage/monitor | POST | Yes | Same-origin + validated coin/margin + D1 config update | Yes, monitor start |

Unknown /api/* paths do not bypass the session gate; after authentication they fall through to a 404.

## Mutation inventory

1. POST /api/auth/login — creates/replaces the operator session.
2. POST /api/auth/logout — revokes the presented session.
3. POST /api/arbitrage/webhook — persists a signed market event; authentication is HMAC, not browser session.
4. POST /api/p2p/{uuid}/apply — financial QvaPay application.
5. POST /api/operations/{uuid}/paid — financial operation update.
6. POST /api/operations/{uuid}/received — financial operation update and possible settlement persistence.
7. POST /api/operations/{uuid}/cancel — financial operation update.
8. POST /api/operations/{uuid}/chat — QvaPay chat mutation.
9. POST /api/operations/{uuid}/rate — QvaPay rating mutation.
10. PUT/PATCH /api/auto-apply/config — intentionally fail-closed with HTTP 501.
11. POST /api/arbitrage/reconcile — D1 event persistence/reconciliation, not a QvaPay financial action.
12. POST /api/arbitrage/monitor — D1 monitor configuration and Durable Object start.

## Credential recovery and rotation

There is no self-service password-reset endpoint. Recovery is an operator-controlled secret rotation in Cloudflare, followed by the production deployment authentication smoke test. Secret values must never be written to source, logs, evidence artifacts or issue comments.

## Cloudflare configuration verification procedure

Repository code cannot prove account-level Cloudflare policy by itself. The production release gate verifies the subset available to Wrangler and the deployed Worker:

1. wrangler deployments status — record the single active 100% version without credentials.
2. wrangler secret list — verify required secret names exist; never print values.
3. wrangler deploy — deploy the reviewed commit directly.
4. Verify the active version changes to the deployed version.
5. Run smoke:cloudflare:production:auth-config against the Worker URL. It verifies health, unauthenticated private-route rejection and invalid-credential handling without exposing secrets.
6. Separately review Cloudflare account configuration for Worker route/hostname, D1 binding, WAF/Access and edge rate-limit policies. Record only policy state and identifiers, never secret material.
7. If a control is not enabled, do not claim it as a production security control.

The production workflow implements steps 1–5 in .github/workflows/ci.yml and uploads deployment evidence as a GitHub Actions artifact.

## Auto-Apply audit invariant

Auto-Apply remains disabled during this security audit. The Cloudflare route returns a fixed disabled configuration/status and rejects configuration writes with HTTP 501. The Worker scheduler starts only the arbitrage monitor; it does not invoke the Auto-Apply engine.

## Automated security tests

The repository tests must cover expired session rejection, logout revocation, explicit same-origin enforcement, private API access without a session, authenticated mutation rejection for missing/cross Origin, AI Auditor token boundary, signed webhook integrity and replay-window rejection, login rate-limit threshold and reset behavior, and Auto-Apply fail-closed behavior.

## Residual risks

| ID | Risk | Current treatment |
|---|---|---|
| T-01 | Credential exposure | Server-side bindings; no secret values in evidence |
| T-02 | Unauthenticated private API | Central session gate |
| T-03 | Cross-origin mutation | Origin validation + SameSite=Strict |
| T-04 | Session replay after logout | D1 token-hash deletion |
| T-05 | Expired session reuse | Expiration check + cleanup |
| T-06 | Credential brute force | D1 login rate limiter |
| T-07 | QvaPay operation authorization drift | QvaPay remains authoritative |
| T-08 | Auto-Apply accidental execution | Cloudflare implementation fail-closed |
| T-09 | Upstream contract drift | Strict parsers |
| T-10 | Dependency vulnerability | CI Security |
| T-11 | Durable audit trail for sensitive actions | Remains an open enhancement |
| T-12 | Cloudflare account drift | External control-plane review is mandatory |

## Verification references

- scripts/cloudflare-production-auth-config-smoke.mjs
- scripts/cloudflare-auth-smoke.mjs
- .github/workflows/ci.yml
- src/cloudflare/access.ts
- src/cloudflare/auth-routes.ts
- src/cloudflare/auth-rate-limit.ts
- src/cloudflare/cloudflare-router.ts
- src/cloudflare/arbitrage-event-ingestion.ts
- src/cloudflare/ai-audit-auth.ts
- src/cloudflare/ai-audit-routes.ts
- src/cloudflare/auto-apply-routes.ts
