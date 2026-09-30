# Financial and Integration Requirements

**Baseline:** 1.0  
**Status:** Active

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| FIN-001 | The finance synchronization shall paginate completed P2P operations rather than assuming the first page is complete. | Critical | Synchronization follows pages until completion or an explicit safety ceiling/truncation condition. |
| FIN-002 | The finance layer shall reconcile remote completed operation IDs with locally persisted ledger IDs. | Critical | Missing-in-ledger and stale-local IDs are reported. |
| FIN-003 | Settlement fee metadata shall be stored when QvaPay provides fee/gross/net data. | Critical | A received settlement persists gross amount, fee, net amount and fee source. |
| FIN-004 | Unknown historical fee metadata shall remain explicitly unknown. | Critical | The ledger does not invent historical fee values when the available source does not provide them. |
| FIN-005 | The system shall not convert QUSD-denominated fees into fiat profit without an explicit valuation source/rule. | Critical | Finance calculations preserve the distinction between recorded fee data and unsupported fiat valuation. |
| INT-001 | QvaPay P2P market reads shall use the documented application integration path configured by the backend. | Critical | The backend can read the P2P market through the configured QvaPay API integration. |
| INT-002 | P2P application and operation mutations shall be proxied by the backend and use the documented QvaPay operation flow. | Critical | Controlled integration tests verify application and operation action routing. |
| INT-003 | Upstream errors, including rate limiting and timeout, shall be surfaced as controlled application errors. | Critical | Integration tests cover 429 and timeout paths. |
| INT-004 | The integration shall preserve QvaPay UUIDs as the stable external identity of P2P operations. | Critical | Operation tracking and finance reconciliation use the remote UUID. |
