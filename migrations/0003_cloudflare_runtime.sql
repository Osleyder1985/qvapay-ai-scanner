-- QvaPay AI Scanner: durable Cloudflare runtime state
-- Migration: 0003_cloudflare_runtime
-- This migration extends the existing D1 baseline without redefining
-- tables already created by 0001_initial_qvapay_scanner.

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
