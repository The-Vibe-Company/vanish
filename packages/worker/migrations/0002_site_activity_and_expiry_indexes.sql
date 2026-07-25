ALTER TABLE sites ADD COLUMN last_activity_at TEXT;

UPDATE sites
SET last_activity_at = created_at
WHERE last_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_uploads_expires_datetime
  ON uploads(datetime(expires_at))
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sites_expires_datetime
  ON sites(datetime(expires_at))
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sites_draft_activity
  ON sites(COALESCE(last_activity_at, created_at))
  WHERE published_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bundles_expires_datetime
  ON bundles(datetime(expires_at))
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_idempotency_expires_datetime
  ON idempotency_keys(datetime(expires_at));

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_datetime
  ON auth_sessions(datetime(expires_at));
