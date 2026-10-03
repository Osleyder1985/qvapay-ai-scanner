# Functional Requirements

**Baseline:** 1.0  
**Status:** Active

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| FR-001 | The system shall retrieve the QvaPay P2P market and expose the available offers to the dashboard. | Critical | A market request returns normalized P2P offers or a controlled upstream error. |
| FR-002 | The system shall support filtering and sorting of market offers by the supported market dimensions. | High | Applying supported filters changes the returned/displayed offer set without bypassing backend validation. |
| FR-003 | The system shall allow a user to initiate a controlled P2P application through the backend. | Critical | A valid application reaches QvaPay through the backend; credentials are not exposed to the browser. |
| FR-004 | The system shall track an active P2P operation and refresh its remote status until a terminal state is reached. | Critical | The operation detail reflects the remote operation and polling stops at terminal state. |
| FR-005 | The system shall provide an operations center for the user's P2P operations. | Critical | Operations are obtained from the user's QvaPay P2P view and can be inspected with role-aware actions. |
| FR-006 | The system shall support the documented operation actions implemented by the project, including paid, received, cancellation, chat and rating where the remote state/role permits. | High | Each action is validated for the operation state and user role before being proxied upstream. |
| FR-007 | The system shall maintain local market history and expose trend/baseline analytics derived from collected market snapshots. | High | Historical points can be persisted and trend/baseline endpoints return explicit sample/coverage information. |
| FR-008 | The system shall support configurable Auto-Apply matching rules while keeping automatic application disabled by default. | Critical | Matching obeys configured bounds, VIP exclusion, concurrency and daily limits; default configuration is disabled. |
| FR-009 | The system shall maintain a local finance ledger from completed P2P operations. | Critical | Completed remote operations can be synchronized idempotently into the local ledger. |
| FR-010 | The system shall expose account/balance information available through the configured QvaPay application credentials. | High | The account view reports balance and clearly identifies unavailable identity data rather than fabricating it. |
| FR-011 | The system shall provide a dashboard with independent areas for market, Auto-Apply, operations, analytics, alerts, account and settings. | High | Navigation reaches each supported area without requiring a single-page monolithic information view. |


| FR-012 | The system shall provide complete paginated operation history without treating a single upstream page as the full history. | Critical | The history view traverses supported pages and exposes truncation or synchronization gaps explicitly. |