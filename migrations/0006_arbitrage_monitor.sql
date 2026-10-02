-- Persistent server-side arbitrage monitor state and latest market snapshot.
CREATE TABLE IF NOT EXISTS arbitrage_monitor_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  min_margin_percent REAL NOT NULL DEFAULT 5,
  coin TEXT NOT NULL DEFAULT 'BANK_CUP',
  schedule_enabled INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  start_local TEXT,
  end_local TEXT,
  active_days_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS arbitrage_monitor_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'starting',
  scan_id TEXT,
  scanned_at TEXT,
  next_run_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  payload_json TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO arbitrage_monitor_config
(id, enabled, min_margin_percent, coin, schedule_enabled, timezone, active_days_json, updated_at)
VALUES (1, 1, 5, 'BANK_CUP', 0, 'UTC', '[1,2,3,4,5,6,7]', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO arbitrage_monitor_state
(id, status, updated_at)
VALUES (1, 'starting', CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_arbitrage_monitor_state_scanned_at
  ON arbitrage_monitor_state (scanned_at DESC);
