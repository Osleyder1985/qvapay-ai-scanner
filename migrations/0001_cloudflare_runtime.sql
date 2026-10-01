-- QvaPay AI Scanner: durable Cloudflare runtime state
CREATE TABLE IF NOT EXISTS market_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  coin TEXT NOT NULL,
  type TEXT NOT NULL,
  samples INTEGER NOT NULL,
  min_rate REAL,
  median_rate REAL,
  max_rate REAL,
  spread REAL,
  UNIQUE(timestamp, coin, type)
);

CREATE INDEX IF NOT EXISTS idx_market_history_coin_type_timestamp
  ON market_history(coin, type, timestamp);

CREATE TABLE IF NOT EXISTS operations_ledger (
  uuid TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operations_ledger_last_seen
  ON operations_ledger(last_seen_at);

CREATE TABLE IF NOT EXISTS finance_ledger (
  uuid TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  type TEXT NOT NULL,
  coin TEXT NOT NULL,
  amount REAL NOT NULL,
  receive REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  gross_amount_qusd REAL NOT NULL,
  fee_qusd REAL,
  net_amount_qusd REAL,
  fee_source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_ledger_updated
  ON finance_ledger(updated_at);

CREATE TABLE IF NOT EXISTS auto_apply_config (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'sell',
  coin TEXT NOT NULL DEFAULT '',
  rate_min REAL,
  rate_max REAL,
  amount_min REAL,
  amount_max REAL,
  daily_max_qusd REAL,
  max_concurrent INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auto_apply_state (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  daily_date TEXT NOT NULL,
  daily_applied_qusd REAL NOT NULL DEFAULT 0,
  recent_apply_attempts_json TEXT NOT NULL DEFAULT '[]',
  applied_offer_ids_json TEXT NOT NULL DEFAULT '[]',
  vip_rejected_offers_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
