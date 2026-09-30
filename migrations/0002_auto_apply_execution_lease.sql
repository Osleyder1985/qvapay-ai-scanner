-- QvaPay AI Scanner — durable Auto-Apply execution lease
-- Migration: 0002_auto_apply_execution_lease
-- Documentation: docs/cloudflare/auto-apply-execution-lease.md

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auto_apply_execution_lease (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner_id TEXT,
  acquired_at TEXT,
  expires_at TEXT,
  updated_at TEXT NOT NULL
);
