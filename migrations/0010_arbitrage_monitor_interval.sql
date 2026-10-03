-- Add persisted cadence for the server-side arbitrage monitor.
ALTER TABLE arbitrage_monitor_config
  ADD COLUMN interval_seconds INTEGER NOT NULL DEFAULT 10;
