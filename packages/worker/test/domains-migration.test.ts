import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('handoff domain migration invariants', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE users (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE sites (
        id TEXT PRIMARY KEY,
        slug TEXT,
        deleted_at TEXT
      );

      INSERT INTO users (id) VALUES ('user-1'), ('user-2');
    `);
    db.exec(readFileSync(
      new URL('../migrations/0003_handoff_domains_and_access.sql', import.meta.url),
      'utf8',
    ));
  });

  afterEach(() => {
    db.close();
  });

  it('keeps site ids, site slugs, and Vanish namespace claims mutually exclusive', () => {
    db.prepare('INSERT INTO sites (id, slug, deleted_at) VALUES (?, ?, NULL)')
      .run('site-id', 'site-slug');

    expect(() => reserve('site-id', 'user-1')).toThrow(/namespace_site_claim_conflict/);
    expect(() => reserve('site-slug', 'user-1')).toThrow(/namespace_site_claim_conflict/);

    reserve('studio', 'user-1');
    expect(() => db.prepare('INSERT INTO sites (id, slug, deleted_at) VALUES (?, ?, NULL)')
      .run('studio', 'different-slug')).toThrow(/site_namespace_claim_conflict/);
    expect(() => db.prepare('INSERT INTO sites (id, slug, deleted_at) VALUES (?, ?, NULL)')
      .run('different-id', 'studio')).toThrow(/site_namespace_claim_conflict/);

    db.prepare("UPDATE sites SET deleted_at = datetime('now') WHERE id = ?").run('site-id');
    reserve('site-slug', 'user-2');

    expect(() => db.prepare('UPDATE sites SET deleted_at = NULL WHERE id = ?')
      .run('site-id')).toThrow(/site_namespace_claim_conflict/);

    db.prepare('INSERT INTO sites (id, slug, deleted_at) VALUES (?, NULL, NULL)')
      .run('config-site');
    expect(() => db.prepare('UPDATE sites SET slug = ? WHERE id = ?')
      .run('studio', 'config-site')).toThrow(/site_namespace_claim_conflict/);
    expect(() => db.prepare('UPDATE domain_reservations SET slug = ? WHERE user_id = ?')
      .run('config-site', 'user-2')).toThrow(/namespace_site_claim_conflict/);
  });

  it('prevents a parent from disappearing while a live child route exists', () => {
    reserve('studio', 'user-1');
    insertDomain('portfolio.studio.vanish.sh', 'user-1', 'studio.vanish.sh', 1);

    expect(() => db.prepare('DELETE FROM domain_reservations WHERE hostname = ?')
      .run('studio.vanish.sh')).toThrow(/domain_parent_not_empty/);

    db.prepare("UPDATE custom_domains SET status = 'deleting' WHERE hostname = ?")
      .run('portfolio.studio.vanish.sh');
    db.prepare('DELETE FROM domain_reservations WHERE hostname = ?').run('studio.vanish.sh');

    expect(() => insertDomain('next.studio.vanish.sh', 'user-1', 'studio.vanish.sh', 1))
      .toThrow(/domain_parent_not_owned/);

    insertDomain('studio.example.com', 'user-1', null, 0);
    insertDomain('portfolio.studio.example.com', 'user-1', 'studio.example.com', 0);

    expect(() => db.prepare("UPDATE custom_domains SET status = 'deleting' WHERE hostname = ?")
      .run('studio.example.com')).toThrow(/domain_parent_not_empty/);

    db.prepare("UPDATE custom_domains SET status = 'deleting' WHERE hostname = ?")
      .run('portfolio.studio.example.com');
    db.prepare("UPDATE custom_domains SET status = 'deleting' WHERE hostname = ?")
      .run('studio.example.com');

    expect(() => insertDomain('next.studio.example.com', 'user-1', 'studio.example.com', 0))
      .toThrow(/domain_parent_not_owned/);
  });

  it('enforces the combined twenty-route entitlement in the database', () => {
    reserve('studio', 'user-1');
    for (let index = 0; index < 20; index++) {
      insertDomain(`route-${index}.studio.vanish.sh`, 'user-1', 'studio.vanish.sh', 1);
    }

    expect(() => insertDomain('overflow.studio.vanish.sh', 'user-1', 'studio.vanish.sh', 1))
      .toThrow(/domain_route_limit_exceeded/);
  });

  function reserve(slug: string, userId: string): void {
    db.prepare(`
      INSERT INTO domain_reservations (hostname, slug, user_id)
      VALUES (?, ?, ?)
    `).run(`${slug}.vanish.sh`, slug, userId);
  }

  function insertDomain(
    hostname: string,
    userId: string,
    parentHostname: string | null,
    managedDns: 0 | 1,
  ): void {
    db.prepare(`
      INSERT INTO custom_domains (hostname, user_id, channel, parent_hostname, managed_dns)
      VALUES (?, ?, 'preview', ?, ?)
    `).run(hostname, userId, parentHostname, managedDns);
  }
});
