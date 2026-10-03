-- Persist the configurable server-side arbitrage monitor cadence.
ALTER TABLE arbitrage_monitor_config
  ADD COLUMN interval_seconds INTEGER NOT NULL DEFAULT 10;
