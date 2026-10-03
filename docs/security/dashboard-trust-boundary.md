# Dashboard trust boundary

**Baseline:** 2026-10-03

## Current production boundary

The Cloudflare Worker is the primary application security boundary. Cloudflare Access is not assumed as the primary authentication layer.

Application controls:
1. AUTH_USERNAME and AUTH_PASSWORD are runtime-only Worker secrets.
2. Login requires same-origin and valid credentials.
3. Successful login creates a random session token; only its SHA-256 hash is stored in D1.
4. qvas_session is HttpOnly, SameSite=Strict, Secure on HTTPS, Path=/ and expires after seven days.
5. Logout deletes the session hash.
6. Expired sessions are rejected and removed.
7. Private API routes are session-gated centrally.
8. Browser state-changing requests require same-origin.
9. Login attempts are rate-limited.
10. Security headers and CSP are attached by the Worker.

## Cloudflare account responsibility

Repository code cannot prove account-level settings. Production evidence must record:
- Worker name and active deployment version;
- route or custom-domain mapping;
- D1 binding;
- required runtime secret bindings, without secret values;
- Access/WAF/rate-limit policies, if any;
- emergency rollback procedure.

## Runtime verification

Use the smoke test with runtime-only values:
SMOKE_BASE_URL=<production-origin> AUTH_USERNAME=<runtime-secret> AUTH_PASSWORD=<runtime-secret> npm run smoke:cloudflare

Never commit credentials.
