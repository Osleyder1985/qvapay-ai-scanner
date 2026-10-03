-- Persist execution controls separately from the legacy monitor configuration table.
CREATE TABLE IF NOT EXISTS arbitrage_execution_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  auto_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_enabled IN (0,1)),
  max_buy_rate REAL,
  min_sell_rate REAL,
  cup_budget REAL NOT NULL DEFAULT 0 CHECK (cup_budget >= 0),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO arbitrage_execution_config
  (id, auto_enabled, max_buy_rate, min_sell_rate, cup_budget, updated_at)
VALUES
  (1, 0, NULL, NULL, 0, CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS arbitrage_execution_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  apply_window_json TEXT NOT NULL DEFAULT '[]',
  last_action_at TEXT,
  last_action TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO arbitrage_execution_state (id, updated_at)
VALUES (1, CURRENT_TIMESTAMP);
