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
