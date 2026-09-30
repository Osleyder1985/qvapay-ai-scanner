# Dashboard trust boundary

## Current security boundary

QvaPay AI Scanner exposes routes that can perform or proxy financial/operational actions. The dashboard therefore **must run local-only** until application-level authentication and authorization are implemented.

The default configuration is:

`DASHBOARD_HOST=127.0.0.1`

The backend now rejects non-loopback bind addresses at startup. Accepted local bind hosts are:

- `127.0.0.1`
- `::1`
- `localhost`

Addresses such as `0.0.0.0`, a LAN IP, or a public IP are rejected.

## Why

The current frontend has no independent user authentication system. A network-accessible dashboard would otherwise expose backend routes that can invoke QvaPay actions using the server-side application credentials.

This control is a deliberate **fail-closed deployment boundary**, not a claim that the application already has LAN/Internet authentication.

## Future LAN/Internet mode

Remote exposure requires a separate implementation of:

- authentication;
- authorization;
- session/token lifecycle;
- CSRF protection where applicable;
- audit logging;
- secret rotation;
- security tests.

That work must be completed and reviewed before the local-only restriction is relaxed.

## Verification

The trust-boundary module has automated tests for supported loopback hosts and rejected non-loopback hosts.
