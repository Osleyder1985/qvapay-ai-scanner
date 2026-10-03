# Threat model — QvaPay AI Scanner

**Baseline:** 2026-10-03  
**Status:** Active

## Security model

The Cloudflare Worker is the primary application security boundary. QvaPay credentials remain server-side. Private API routes require a D1-backed session. Browser mutations require a matching Origin. QvaPay remains the authority for operation-level permissions and state.

## Control matrix

| Control | Provider | Repository evidence |
|---|---|---|
| Application authentication | Worker | src/cloudflare/auth-routes.ts |
| Credential verification | Worker secrets AUTH_USERNAME / AUTH_PASSWORD | src/cloudflare/auth-routes.ts |
| Session lifecycle | Worker + D1 | src/cloudflare/access.ts |
| Private-route authorization | Central Worker gate | src/cloudflare/cloudflare-router.ts |
| Operation authorization | QvaPay | upstream API contracts |
| CSRF / same-origin | Worker Origin validation + SameSite=Strict | access.ts / cloudflare-router.ts |
| Expiration | Worker | seven-day session TTL |
| Revocation | Worker + D1 | destroySession() |
| Login rate limiting | Worker + D1 | src/cloudflare/auth-rate-limit.ts |
| Credential recovery | Operator procedure | no self-service recovery endpoint |
| Edge controls | Cloudflare account | external evidence required |

A single configured application identity currently operates the dashboard; there is no multi-user role model.

## Private route inventory

All API routes are session-gated except explicit public/authentication boundaries: health, auth, AI-auditor endpoints and the signed arbitrage webhook.

Sensitive mutations are:
- POST /api/p2p/{uuid}/apply
- POST /api/operations/{uuid}/paid
- POST /api/operations/{uuid}/received
- POST /api/operations/{uuid}/cancel
- POST /api/operations/{uuid}/chat
- POST /api/operations/{uuid}/rate
- PUT/PATCH /api/auto-apply/config (currently disabled and returns 501)

## Threats and residual controls

| ID | Threat | Control | Residual |
|---|---|---|---|
| T-01 | QvaPay secret reaches browser | server-side runtime bindings | Low |
| T-02 | Unauthenticated private API | central session gate | Low |
| T-03 | Cross-origin mutation | Origin validation + strict cookie | Low |
| T-04 | Session replay after logout | D1 token-hash deletion | Low |
| T-05 | Expired session reuse | expiration check + cleanup | Low |
| T-06 | Credential brute force | login rate limiter | Medium |
| T-07 | Unauthorized QvaPay operation | Worker session + QvaPay authorization | Medium |
| T-08 | Unsupported Auto-Apply execution | 501 fail-closed + disabled UI | Low |
| T-09 | Upstream contract drift | strict parsers | Medium |
| T-10 | Dependency vulnerability | npm lockfile + CI Security | Medium |
| T-11 | Missing durable sensitive-action audit trail | internal telemetry only | High |
| T-12 | Cloudflare account drift | Wrangler deployment + external control-plane review | Medium |

## Verification

scripts/cloudflare-auth-smoke.mjs verifies health, security headers, unauthenticated private access, login, session, dashboard access, authenticated P2P access, logout and session revocation.

CI Quality and Security are required repository gates.

Cloudflare account evidence remains external to the repository. It must verify Worker route, D1 binding, runtime secret bindings, deployment/version, and any Access/WAF/rate-limit policies without exposing secret values.
