# AI Auditor — Read-only service identity

## Purpose

QvaPay AI Scanner exposes a dedicated diagnostic API for an external technical auditor. It is intentionally separate from the normal dashboard session and cannot execute financial or configuration mutations.

## Authentication

The Worker expects:

```
Authorization: Bearer <AI auditor token>
```

The Worker does **not** store the raw token. Configure the SHA-256 hexadecimal digest as the Cloudflare secret:

```
AI_AUDITOR_TOKEN_HASH
```

Generate the digest locally with:

```powershell
[Convert]::ToHexString(
  [System.Security.Cryptography.SHA256]::HashData(
    [System.Text.Encoding]::UTF8.GetBytes("YOUR_RANDOM_TOKEN")
  )
).ToLower()
```

Store only the resulting digest in the Worker secret. Never commit the token or digest to Git.

## Runtime configuration

Optional:

```
AI_AUDITOR_BUILD_SHA
```

This value is diagnostic metadata only and must not contain credentials.

Existing QvaPay secrets remain independent:

- `QVAPAY_API_BASE_URL`
- `QVAPAY_APP_ID`
- `QVAPAY_APP_SECRET`
- `QVAPAY_FEED_SECRET`

## Endpoints

All AI Auditor endpoints are **GET-only**:

| Endpoint | Purpose |
|---|---|
| `/api/ai-audit/health` | Composite Worker, D1, Durable Object, monitor and configuration health |
| `/api/ai-audit/monitor` | Monitor configuration, persisted state, alarm and snapshot counters |
| `/api/ai-audit/arbitrage` | Current persisted arbitrage snapshot |
| `/api/ai-audit/database` | D1 health |
| `/api/ai-audit/runtime` | Non-secret runtime metadata |

Unknown paths return 404. Non-GET requests return 405. Missing/invalid credentials return 401. Unconfigured auditor authentication fails closed with 503.

## Security properties

- The auditor bypasses the normal human session **only** for the exact `/api/ai-audit/*` namespace.
- The auditor has no write endpoint.
- No QvaPay credential or authentication secret is returned.
- The token is compared by SHA-256 digest using constant-time string comparison.
- A per-Worker-instance rate limit protects the auditor namespace.
- Existing same-origin protections and human-session authentication remain unchanged for all other APIs.
- Audit diagnostics read persisted monitor state and do not trigger an arbitrage scan.

## Cloudflare setup

Create a high-entropy token outside the repository, calculate its SHA-256 digest, then configure:

```bash
npx wrangler secret put AI_AUDITOR_TOKEN_HASH
```

Paste the hexadecimal SHA-256 digest when prompted.

If the deployment workflow uses a Cloudflare API token, that deployment credential remains separate from `AI_AUDITOR_TOKEN_HASH`.

## Example request

```bash
curl https://qvapay-ai-scanner.osleyder-gonzalez1985.workers.dev/api/ai-audit/health \
  -H "Authorization: Bearer YOUR_RANDOM_TOKEN"
```

Do not place the example token in shell history when using a real credential.

## Trust boundary

The AI Auditor is a **diagnostic principal**, not an application administrator. Its intended permissions are:

- read Worker health;
- read D1 health;
- read Durable Object scheduling state;
- read persisted arbitrage monitor state;
- read persisted arbitrage snapshots.

It must not:

- submit QvaPay orders;
- apply/cancel offers;
- execute payments;
- change arbitrage configuration;
- modify D1 state;
- deploy Workers;
- manage Cloudflare resources.


## CI runtime bridge

For controlled runtime verification, the repository includes a manual-only GitHub Actions workflow:

- `.github/workflows/ai-audit-runtime.yml`
- trigger: `workflow_dispatch` only;
- required GitHub Actions secret: `AI_AUDITOR_TOKEN`;
- the workflow calls only the five GET-only AI Auditor endpoints;
- the token is passed only as an HTTP Authorization header and is not written to the artifact;
- the resulting JSON diagnostics are uploaded as a short-lived artifact (`3` days).

This bridge does not grant deployment, GitHub, or Cloudflare administration to the auditor identity. It only makes the already-authorized read-only runtime diagnostics available through the repository's controlled CI boundary.

Configure the same raw token whose SHA-256 digest is stored in Cloudflare as `AI_AUDITOR_TOKEN_HASH`. Never put the raw token in repository files, workflow YAML, issues, PR comments, or artifacts.
