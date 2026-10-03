-- Timestamp provenance and clock-skew quarantine metadata.
ALTER TABLE market_events ADD COLUMN source_event_at TEXT;
ALTER TABLE market_events ADD COLUMN source_observed_at TEXT;
ALTER TABLE market_events ADD COLUMN timestamp_quality TEXT NOT NULL DEFAULT 'valid';
ALTER TABLE market_events ADD COLUMN quarantined INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_market_events_quarantine
  ON market_events (coin, quarantined, event_at DESC);
