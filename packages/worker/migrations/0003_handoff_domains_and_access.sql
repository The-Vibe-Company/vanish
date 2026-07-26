CREATE TABLE IF NOT EXISTS custom_domains (
  hostname TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
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
  WHERE status != 'deleting';
CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON custom_domains(status, grace_expires_at);

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
