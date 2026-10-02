-- QvaPay AI Scanner: align finance ledger ownership with the active operations ledger.
-- Migration: 0007_finance_ledger_remove_legacy_fk
--
-- The original 0001 schema linked finance_ledger.uuid to the retired
-- p2p_operations table. The Cloudflare runtime persists operations in
-- operations_ledger instead, so the legacy foreign key makes valid finance
-- synchronization fail whenever an operation is not present in p2p_operations.

CREATE TABLE finance_ledger_v2 (
  uuid TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status = 'completed'),
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  coin TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  receive REAL NOT NULL CHECK (receive >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  gross_amount_qusd REAL NOT NULL,
  fee_qusd REAL,
  net_amount_qusd REAL,
  fee_source TEXT NOT NULL CHECK (fee_source IN ('qvapay_received', 'unknown'))
);

INSERT INTO finance_ledger_v2 (
  uuid, status, type, coin, amount, receive, created_at, updated_at,
  recorded_at, gross_amount_qusd, fee_qusd, net_amount_qusd, fee_source
)
SELECT
  uuid, status, type, coin, amount, receive, created_at, updated_at,
  recorded_at, gross_amount_qusd, fee_qusd, net_amount_qusd, fee_source
FROM finance_ledger;

DROP TABLE finance_ledger;
ALTER TABLE finance_ledger_v2 RENAME TO finance_ledger;

CREATE INDEX IF NOT EXISTS idx_finance_ledger_updated
  ON finance_ledger (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_ledger_type_updated
  ON finance_ledger (type, updated_at DESC);
