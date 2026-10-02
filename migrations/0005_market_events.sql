-- Market event history for currency-isolated execution analytics.
CREATE TABLE IF NOT EXISTS market_events (
  dedupe_key TEXT PRIMARY KEY,
  event_id TEXT,
  offer_uuid TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT,
  side TEXT,
  coin TEXT NOT NULL,
  amount REAL,
  available_amount REAL,
  receive REAL,
  rate REAL,
  event_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('stream', 'webhook', 'reconciliation')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_events_coin_event_at
  ON market_events (coin, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_events_offer_uuid
  ON market_events (offer_uuid);

CREATE INDEX IF NOT EXISTS idx_market_events_coin_event
  ON market_events (coin, event);
