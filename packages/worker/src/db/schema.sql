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
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('web', 'cli', 'manual')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_active_web_user
  ON api_keys(user_id)
  WHERE source = 'web' AND revoked_at IS NULL;

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
CREATE INDEX IF NOT EXISTS idx_uploads_expires_datetime
  ON uploads(datetime(expires_at))
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  slug TEXT,
  upload_token TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  expected_file_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_active_slug
  ON sites(slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sites_expires ON sites(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sites_expires_datetime
  ON sites(datetime(expires_at))
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sites_draft_activity
  ON sites(COALESCE(last_activity_at, created_at))
  WHERE published_at IS NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS site_channels (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_site_channels_site ON site_channels(site_id);

CREATE TABLE IF NOT EXISTS domain_reservations (
  hostname TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_domains (
  hostname TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  parent_hostname TEXT,
  managed_dns INTEGER NOT NULL DEFAULT 0 CHECK (managed_dns IN (0, 1)),
  provider_hostname_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending_dns'
    CHECK (status IN ('pending_dns', 'pending_tls', 'active', 'error', 'suspended', 'deleting')),
  dns_records TEXT NOT NULL DEFAULT '[]',
  last_error TEXT,
  verified_at TEXT,
  grace_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_user ON custom_domains(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_domains_one_entitled_per_user
  ON custom_domains(user_id)
  WHERE status != 'deleting' AND parent_hostname IS NULL;
CREATE INDEX IF NOT EXISTS idx_custom_domains_parent ON custom_domains(user_id, parent_hostname);
CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON custom_domains(status, grace_expires_at);
CREATE TRIGGER IF NOT EXISTS trg_custom_domains_route_limit
BEFORE INSERT ON custom_domains
WHEN NEW.parent_hostname IS NOT NULL
  AND (
    SELECT COUNT(*) FROM custom_domains
    WHERE user_id = NEW.user_id
      AND parent_hostname IS NOT NULL
      AND status != 'deleting'
  ) >= 20
BEGIN
  SELECT RAISE(ABORT, 'domain_route_limit_exceeded');
END;

CREATE TABLE IF NOT EXISTS site_access (
  site_id TEXT PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'link' CHECK (mode IN ('link', 'password')),
  password_hash TEXT,
  password_salt TEXT,
  policy_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (mode = 'link' AND password_hash IS NULL AND password_salt IS NULL)
    OR
    (mode = 'password' AND password_hash IS NOT NULL AND password_salt IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS site_files (
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (site_id, path)
);

CREATE TABLE IF NOT EXISTS pending_r2_deletions (
  r2_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  upload_token TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  expected_file_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_bundles_user ON bundles(user_id);
CREATE INDEX IF NOT EXISTS idx_bundles_expires ON bundles(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bundles_expires_datetime
  ON bundles(datetime(expires_at))
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS bundle_files (
  bundle_id TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (bundle_id, path)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope TEXT NOT NULL,
  owner TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL DEFAULT (datetime('now', '+48 hours')),
  PRIMARY KEY (scope, owner, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires_datetime
  ON idempotency_keys(datetime(expires_at));

-- Temporary sessions for CLI login flow
CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id TEXT PRIMARY KEY,
  api_key TEXT,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_datetime
  ON auth_sessions(datetime(expires_at));

-- Privacy-light product funnel events. Properties must never include filenames,
-- paths, tokens, keys, email addresses, or content.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  site_id TEXT REFERENCES sites(id) ON DELETE SET NULL,
  upload_id TEXT REFERENCES uploads(id) ON DELETE SET NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_name_created ON events(name, created_at);
CREATE INDEX IF NOT EXISTS idx_events_user_created ON events(user_id, created_at) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_site_name ON events(site_id, name) WHERE site_id IS NOT NULL;

-- Rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'upload',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON rate_limits(identifier, action, created_at);
