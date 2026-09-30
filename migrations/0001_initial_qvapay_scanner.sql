-- QvaPay AI Scanner — D1 baseline schema
-- Migration: 0001_initial_qvapay_scanner
-- Documentation: docs/cloudflare/d1-schema.md
-- This migration does not modify or delete the current JSON stores.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL,
  coin TEXT NOT NULL,
  type TEXT NOT NULL,
  samples INTEGER NOT NULL CHECK (samples >= 0),
  min_rate REAL,
  median_rate REAL,
  max_rate REAL,
  spread REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_lookup ON market_snapshots (coin, type, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_captured ON market_snapshots (captured_at DESC);

CREATE TABLE IF NOT EXISTS p2p_operations (
  uuid TEXT PRIMARY KEY, type TEXT, status TEXT, amount REAL, receive REAL,
  current_user_id TEXT, user_uuid TEXT, user_id TEXT, user_username TEXT, user_name TEXT,
  peer_uuid TEXT, peer_id TEXT, peer_username TEXT, peer_name TEXT,
  recorded_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_p2p_operations_status_seen ON p2p_operations (status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_p2p_operations_type_status_seen ON p2p_operations (type, status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_p2p_operations_last_seen ON p2p_operations (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS finance_ledger (
  uuid TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status = 'completed'),
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  coin TEXT NOT NULL, amount REAL NOT NULL CHECK (amount > 0), receive REAL NOT NULL CHECK (receive >= 0),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, recorded_at TEXT NOT NULL,
  gross_amount_qusd REAL NOT NULL, fee_qusd REAL, net_amount_qusd REAL,
  fee_source TEXT NOT NULL CHECK (fee_source IN ('qvapay_received', 'unknown')),
  FOREIGN KEY (uuid) REFERENCES p2p_operations(uuid)
);
CREATE INDEX IF NOT EXISTS idx_finance_ledger_updated ON finance_ledger (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_ledger_type_updated ON finance_ledger (type, updated_at DESC);

CREATE TABLE IF NOT EXISTS auto_apply_config (
  id INTEGER PRIMARY KEY CHECK (id = 1), enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  type TEXT NOT NULL CHECK (type IN ('buy','sell')), coin TEXT NOT NULL DEFAULT '',
  rate_min REAL, rate_max REAL, amount_min REAL, amount_max REAL, daily_max_qusd REAL,
  max_concurrent INTEGER NOT NULL CHECK (max_concurrent >= 1), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auto_apply_state (
  id INTEGER PRIMARY KEY CHECK (id = 1), daily_date TEXT NOT NULL,
  daily_applied_qusd REAL NOT NULL DEFAULT 0 CHECK (daily_applied_qusd >= 0),
  last_scan_at TEXT, last_action_at TEXT, last_message TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auto_apply_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, offer_uuid TEXT NOT NULL, attempted_at TEXT NOT NULL,
  http_status INTEGER, success INTEGER NOT NULL CHECK (success IN (0,1)),
  amount_qusd REAL, response_json TEXT, reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_auto_apply_attempts_time ON auto_apply_attempts (attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_apply_attempts_offer_time ON auto_apply_attempts (offer_uuid, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_apply_attempts_success_time ON auto_apply_attempts (success, attempted_at DESC);

CREATE TABLE IF NOT EXISTS auto_apply_applied_offers (
  offer_uuid TEXT PRIMARY KEY, applied_at TEXT NOT NULL, amount_qusd REAL NOT NULL CHECK (amount_qusd >= 0)
);
CREATE TABLE IF NOT EXISTS auto_apply_vip_rejections (
  offer_uuid TEXT PRIMARY KEY, rejected_at TEXT NOT NULL, expires_at TEXT NOT NULL, reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auto_apply_vip_expiry ON auto_apply_vip_rejections (expires_at);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT,
  pages_fetched INTEGER NOT NULL DEFAULT 0, remote_count INTEGER NOT NULL DEFAULT 0,
  ledger_count INTEGER NOT NULL DEFAULT 0, missing_in_ledger_count INTEGER NOT NULL DEFAULT 0,
  stale_local_count INTEGER NOT NULL DEFAULT 0, truncated INTEGER NOT NULL DEFAULT 0 CHECK (truncated IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed','truncated')), error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs (started_at DESC);
