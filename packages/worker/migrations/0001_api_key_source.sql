ALTER TABLE api_keys ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_active_web_user
  ON api_keys(user_id)
  WHERE source = 'web' AND revoked_at IS NULL;
