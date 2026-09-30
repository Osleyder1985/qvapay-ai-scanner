# Security Requirements

**Baseline:** 1.0  
**Status:** Active

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| SEC-001 | QvaPay application credentials shall remain server-side and shall never be sent to the browser. | Critical | Frontend requests use dashboard endpoints; app credentials exist only in backend configuration. |
| SEC-002 | The dashboard shall be local-only unless an explicit authenticated/authorized deployment model is implemented. | Critical | Non-loopback `DASHBOARD_HOST` causes startup failure. |
| SEC-003 | Financial operation endpoints shall validate operation state and permitted role/action before upstream mutation. | Critical | Invalid role/state combinations are rejected before the upstream action is performed. |
| SEC-004 | Auto-Apply shall have a default-off kill switch and bounded execution rules. | Critical | The default configuration disables Auto-Apply and the engine enforces configured limits. |
| SEC-005 | VIP-only offers shall not be automatically applied when the account is not known to have VIP access. | Critical | VIP-only offers are excluded and rejected offers enter a cooldown set. |
| SEC-006 | HTTP 429 responses from QvaPay shall trigger controlled backoff rather than an uncontrolled request loop. | Critical | The market collector records the rate limit and delays subsequent upstream requests. |
| SEC-007 | Sensitive operation routes shall reject malformed or unauthorized action requests. | Critical | Integration tests cover sensitive route validation. |
| SEC-008 | Dependency installation and security checks shall be reproducible in CI. | High | `npm ci` and the dependency audit workflow run from the committed lockfile. |
