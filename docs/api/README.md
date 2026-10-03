# Internal API Contract

This directory contains the OpenAPI contract for the Cloudflare Worker HTTP API.

## Production security boundary

Production uses the Worker as the primary application authentication boundary.

- Private /api/* routes require a D1-backed session.
- POST/PUT/PATCH/DELETE browser mutations require an explicit matching Origin.
- /api/auth/login uses same-origin credentials plus the D1-backed login rate limiter.
- /api/auth/logout is same-origin and revokes the presented session.
- /api/ai-audit/* is a separate read-only technical identity protected by a token hash.
- /api/arbitrage/webhook is public only at the HTTP session layer; it requires HMAC-SHA-256 signature and a fresh timestamp.
- QvaPay remains authoritative for operation-level authorization and state.
- There is currently one configured dashboard identity and no multi-user RBAC inside the Worker.

Cloudflare Access, WAF and edge rate limiting are not assumed as the primary application control. If enabled, they are defense-in-depth and must be verified as external account-level evidence.

## Route inventory

The canonical route-by-route security and mutation inventory is maintained in docs/security/threat-model.md. Any route added to the Worker must be added there in the same change.

## Auto-Apply

Auto-Apply is fail-closed in the Cloudflare deployment:

- GET config/status expose a fixed disabled state.
- PUT/PATCH /api/auto-apply/config return HTTP 501.
- The Worker scheduler starts the arbitrage monitor only; it does not invoke the Auto-Apply engine.

## Cloudflare evidence

Repository code cannot prove account-level settings by itself. The production workflow verifies deployment/version, required secret names, and the production authentication smoke without exposing secret values. Account-level Worker route, D1 binding, Access/WAF and edge-rate-limit settings require separate Cloudflare control-plane review.

## Maintenance rule

Route, contract or security-boundary changes must update docs/api/openapi.yaml and docs/security/threat-model.md in the same change.
