CREATE TABLE IF NOT EXISTS auth_login_rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_login_rate_limits_blocked_until
  ON auth_login_rate_limits(blocked_until);

CREATE INDEX IF NOT EXISTS idx_auth_login_rate_limits_updated_at
  ON auth_login_rate_limits(updated_at);
