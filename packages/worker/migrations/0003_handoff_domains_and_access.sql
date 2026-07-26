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

-- A namespace and a live site share the same <slug>.vanish.sh routing space.
-- Keep that claim exclusive in the database so concurrent API requests cannot
-- pass independent preflight reads and both commit.
CREATE TRIGGER IF NOT EXISTS trg_domain_reservations_site_claim_insert
BEFORE INSERT ON domain_reservations
WHEN EXISTS (
  SELECT 1
  FROM sites
  WHERE deleted_at IS NULL
    AND (id = NEW.slug OR slug = NEW.slug)
)
BEGIN
  SELECT RAISE(ABORT, 'namespace_site_claim_conflict');
END;

CREATE TRIGGER IF NOT EXISTS trg_domain_reservations_site_claim_update
BEFORE UPDATE OF slug ON domain_reservations
WHEN EXISTS (
  SELECT 1
  FROM sites
  WHERE deleted_at IS NULL
    AND (id = NEW.slug OR slug = NEW.slug)
)
BEGIN
  SELECT RAISE(ABORT, 'namespace_site_claim_conflict');
END;

CREATE TRIGGER IF NOT EXISTS trg_sites_namespace_claim_insert
BEFORE INSERT ON sites
WHEN NEW.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM domain_reservations
    WHERE slug = NEW.id
       OR (NEW.slug IS NOT NULL AND slug = NEW.slug)
  )
BEGIN
  SELECT RAISE(ABORT, 'site_namespace_claim_conflict');
END;

CREATE TRIGGER IF NOT EXISTS trg_sites_namespace_claim_update
BEFORE UPDATE OF id, slug, deleted_at ON sites
WHEN NEW.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM domain_reservations
    WHERE slug = NEW.id
       OR (NEW.slug IS NOT NULL AND slug = NEW.slug)
  )
BEGIN
  SELECT RAISE(ABORT, 'site_namespace_claim_conflict');
END;

-- Child routes must still have an owned parent when their INSERT commits.
-- managed_dns identifies reserved vanish.sh parents; customer-owned parents
-- are represented by a non-child custom_domains row.
CREATE TRIGGER IF NOT EXISTS trg_custom_domains_parent_ownership_insert
BEFORE INSERT ON custom_domains
WHEN NEW.parent_hostname IS NOT NULL
  AND NOT (
    (
      NEW.managed_dns = 1
      AND EXISTS (
        SELECT 1
        FROM domain_reservations
        WHERE hostname = NEW.parent_hostname
          AND user_id = NEW.user_id
      )
    )
    OR
    (
      NEW.managed_dns = 0
      AND EXISTS (
        SELECT 1
        FROM custom_domains
        WHERE hostname = NEW.parent_hostname
          AND user_id = NEW.user_id
          AND parent_hostname IS NULL
          AND status != 'deleting'
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'domain_parent_not_owned');
END;

CREATE TRIGGER IF NOT EXISTS trg_custom_domains_parent_ownership_update
BEFORE UPDATE OF user_id, parent_hostname, managed_dns ON custom_domains
WHEN NEW.parent_hostname IS NOT NULL
  AND NOT (
    (
      NEW.managed_dns = 1
      AND EXISTS (
        SELECT 1
        FROM domain_reservations
        WHERE hostname = NEW.parent_hostname
          AND user_id = NEW.user_id
      )
    )
    OR
    (
      NEW.managed_dns = 0
      AND EXISTS (
        SELECT 1
        FROM custom_domains
        WHERE hostname = NEW.parent_hostname
          AND user_id = NEW.user_id
          AND parent_hostname IS NULL
          AND status != 'deleting'
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'domain_parent_not_owned');
END;

-- Parent removal is conditional on there being no live child route. These
-- guards close the race between the route-level count and the later write.
CREATE TRIGGER IF NOT EXISTS trg_domain_reservations_children_delete
BEFORE DELETE ON domain_reservations
WHEN EXISTS (
  SELECT 1
  FROM custom_domains
  WHERE user_id = OLD.user_id
    AND parent_hostname = OLD.hostname
    AND status != 'deleting'
)
BEGIN
  SELECT RAISE(ABORT, 'domain_parent_not_empty');
END;

CREATE TRIGGER IF NOT EXISTS trg_custom_domains_children_deleting
BEFORE UPDATE OF status ON custom_domains
WHEN OLD.parent_hostname IS NULL
  AND OLD.status != 'deleting'
  AND NEW.status = 'deleting'
  AND EXISTS (
    SELECT 1
    FROM custom_domains
    WHERE user_id = OLD.user_id
      AND parent_hostname = OLD.hostname
      AND status != 'deleting'
  )
BEGIN
  SELECT RAISE(ABORT, 'domain_parent_not_empty');
END;

CREATE TRIGGER IF NOT EXISTS trg_custom_domains_children_delete
BEFORE DELETE ON custom_domains
WHEN OLD.parent_hostname IS NULL
  AND EXISTS (
    SELECT 1
    FROM custom_domains
    WHERE user_id = OLD.user_id
      AND parent_hostname = OLD.hostname
      AND status != 'deleting'
  )
BEGIN
  SELECT RAISE(ABORT, 'domain_parent_not_empty');
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
