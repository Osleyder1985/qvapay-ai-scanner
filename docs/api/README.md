# Internal API Contract

This directory contains the OpenAPI contract for the Cloudflare Worker HTTP API.

## Security boundary

Production uses the Worker as the primary application authentication boundary. Private routes require a D1-backed session and state-changing browser requests require same-origin validation.

Cloudflare Access is not assumed as primary authentication. Any Access, WAF or edge rate-limit control is defense-in-depth and must be recorded as external account-level evidence.

## Private mutations

- POST /api/p2p/{uuid}/apply
- POST /api/operations/{uuid}/paid
- POST /api/operations/{uuid}/received
- POST /api/operations/{uuid}/cancel
- POST /api/operations/{uuid}/chat
- POST /api/operations/{uuid}/rate
- PUT/PATCH /api/auto-apply/config (disabled; returns 501)

The Worker authenticates the dashboard operator; QvaPay remains responsible for operation-level authorization.

## Maintenance rule

Route, contract or security-boundary changes must update docs/api/openapi.yaml and the security baseline in the same change.
