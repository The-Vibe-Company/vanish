-- vanish D1 schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_id INTEGER UNIQUE,
  email TEXT UNIQUE,
  github_username TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_expires ON uploads(expires_at) WHERE deleted_at IS NULL;

-- Temporary sessions for CLI login flow
CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id TEXT PRIMARY KEY,
  api_key TEXT,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- Rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'upload',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON rate_limits(identifier, action, created_at);
