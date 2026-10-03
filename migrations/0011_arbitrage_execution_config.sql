-- Persist execution controls for the arbitrage module.
ALTER TABLE arbitrage_monitor_config ADD COLUMN auto_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_enabled IN (0,1));
ALTER TABLE arbitrage_monitor_config ADD COLUMN max_buy_rate REAL;
ALTER TABLE arbitrage_monitor_config ADD COLUMN min_sell_rate REAL;
ALTER TABLE arbitrage_monitor_config ADD COLUMN cup_budget REAL NOT NULL DEFAULT 0 CHECK (cup_budget >= 0);
