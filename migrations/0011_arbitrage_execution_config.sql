-- Persist execution controls for the arbitrage module.
ALTER TABLE arbitrage_monitor_config ADD COLUMN auto_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_enabled IN (0,1));
ALTER TABLE arbitrage_monitor_config ADD COLUMN max_buy_rate REAL;
ALTER TABLE arbitrage_monitor_config ADD COLUMN min_sell_rate REAL;
ALTER TABLE arbitrage_monitor_config ADD COLUMN cup_budget REAL NOT NULL DEFAULT 0 CHECK (cup_budget >= 0);

CREATE TABLE IF NOT EXISTS arbitrage_execution_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  apply_window_json TEXT NOT NULL DEFAULT '[]',
  last_action_at TEXT,
  last_action TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO arbitrage_execution_state (id, updated_at)
VALUES (1, CURRENT_TIMESTAMP);

