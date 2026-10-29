-- Email allowlists for protected sites, access protection for file uploads,
-- and one-time email codes. site_access is rebuilt because SQLite cannot
-- change a CHECK constraint in place; existing rows keep their policy_version
-- so issued visitor sessions stay valid.

CREATE TABLE site_access_next (
  site_id TEXT PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'link' CHECK (mode IN ('link', 'password', 'email')),
  password_hash TEXT,
  password_salt TEXT,
  allowed_emails TEXT,
  policy_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (mode = 'link' AND password_hash IS NULL AND password_salt IS NULL AND allowed_emails IS NULL)
    OR
    (mode = 'password' AND password_hash IS NOT NULL AND password_salt IS NOT NULL AND allowed_emails IS NULL)
    OR
    (mode = 'email' AND password_hash IS NULL AND password_salt IS NULL AND allowed_emails IS NOT NULL)
  )
);

INSERT INTO site_access_next (site_id, mode, password_hash, password_salt, allowed_emails, policy_version, created_at, updated_at)
SELECT site_id, mode, password_hash, password_salt, NULL, policy_version, created_at, updated_at
FROM site_access;

DROP TABLE site_access;
ALTER TABLE site_access_next RENAME TO site_access;

CREATE TABLE IF NOT EXISTS upload_access (
  upload_id TEXT PRIMARY KEY REFERENCES uploads(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'link' CHECK (mode IN ('link', 'password', 'email')),
  password_hash TEXT,
  password_salt TEXT,
  allowed_emails TEXT,
  policy_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (mode = 'link' AND password_hash IS NULL AND password_salt IS NULL AND allowed_emails IS NULL)
    OR
    (mode = 'password' AND password_hash IS NOT NULL AND password_salt IS NOT NULL AND allowed_emails IS NULL)
    OR
    (mode = 'email' AND password_hash IS NULL AND password_salt IS NULL AND allowed_emails IS NOT NULL)
  )
);

-- Stores hashes only; codes are single use, expire after a few minutes and
-- lock after repeated wrong attempts.
CREATE TABLE IF NOT EXISTS access_codes (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('site', 'upload')),
  resource_id TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_access_codes_lookup
  ON access_codes(resource_type, resource_id, email_hash);
CREATE INDEX IF NOT EXISTS idx_access_codes_expires
  ON access_codes(expires_at);
