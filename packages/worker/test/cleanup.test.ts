import { describe, expect, it } from 'vitest';
import { handleCleanup } from '../src/cron/cleanup.js';
import type { Env } from '../src/types.js';

describe('cleanup', () => {
  it('atomically claims abandoned drafts and drains their queued R2 objects', async () => {
    const db = new CleanupDB('2000-01-01T00:00:00.000Z');
    const bucket = new CleanupBucket(['sites/draft/index.html']);

    await handleCleanup(makeEnv(db, bucket));

    expect(db.deleted).toBe(true);
    expect(db.siteFiles.size).toBe(0);
    expect(db.pending.size).toBe(0);
    expect(bucket.objects.size).toBe(0);
    expect(db.abandonedQuery).toContain('COALESCE(last_activity_at, created_at)');
    expect(db.claimQueries.join(' ')).toContain('INSERT OR IGNORE INTO pending_r2_deletions');
    expect(db.claimQueries.join(' ')).toContain("COALESCE(last_activity_at, created_at) < datetime('now', '-6 hours')");
  });

  it('keeps a recently active draft and its files', async () => {
    const db = new CleanupDB(new Date().toISOString());
    const bucket = new CleanupBucket(['sites/draft/index.html']);

    await handleCleanup(makeEnv(db, bucket));

    expect(db.deleted).toBe(false);
    expect(db.siteFiles.size).toBe(1);
    expect(bucket.objects.size).toBe(1);
  });
});

function makeEnv(db: CleanupDB, bucket: CleanupBucket): Env {
  return {
    DB: db as unknown as D1Database,
    BUCKET: bucket as unknown as R2Bucket,
    BASE_URL: 'https://vanish.sh',
    SELF_HOSTED: 'false',
    DEFAULT_TIER: 'free',
  };
}

class CleanupBucket {
  objects: Set<string>;

  constructor(keys: string[]) {
    this.objects = new Set(keys);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

class CleanupDB {
  deleted = false;
  pending = new Set<string>();
  siteFiles = new Set(['sites/draft/index.html']);
  abandonedQuery = '';
  claimQueries: string[] = [];

  constructor(private lastActivityAt: string) {}

  prepare(sql: string): CleanupStatement {
    return new CleanupStatement(this, sql);
  }

  async batch(statements: CleanupStatement[]): Promise<Array<{ meta: { changes: number } }>> {
    this.claimQueries = statements.map(statement => normalizeSql(statement.sql));
    const results = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  isAbandoned(): boolean {
    return !this.deleted && Date.now() - new Date(this.lastActivityAt).getTime() > 6 * 60 * 60 * 1000;
  }
}

class CleanupStatement {
  private args: unknown[] = [];

  constructor(private db: CleanupDB, readonly sql: string) {}

  bind(...args: unknown[]): CleanupStatement {
    this.args = args;
    return this;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const sql = normalizeSql(this.sql);
    if (sql.includes('SELECT id FROM uploads') || sql.includes('expires_at IS NOT NULL')) {
      return { results: [] };
    }
    if (sql.includes('SELECT id FROM sites') && sql.includes('published_at IS NULL')) {
      this.db.abandonedQuery = sql;
      return { results: (this.db.isAbandoned() ? [{ id: 'draft' }] : []) as T[] };
    }
    if (sql.includes('SELECT r2_key FROM pending_r2_deletions')) {
      return {
        results: Array.from(this.db.pending).map(r2_key => ({ r2_key })) as T[],
      };
    }
    throw new Error(`Unhandled cleanup all query: ${sql}`);
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const sql = normalizeSql(this.sql);
    if (sql.includes('INSERT OR IGNORE INTO pending_r2_deletions')) {
      if (this.db.isAbandoned()) {
        for (const key of this.db.siteFiles) this.db.pending.add(key);
      }
      return { meta: { changes: this.db.pending.size } };
    }
    if (sql.includes('UPDATE sites SET deleted_at') && sql.includes('COALESCE(last_activity_at, created_at)')) {
      const changes = this.db.isAbandoned() ? 1 : 0;
      if (changes) this.db.deleted = true;
      return { meta: { changes } };
    }
    if (sql.includes('DELETE FROM site_files')) {
      if (this.db.deleted) this.db.siteFiles.clear();
      return { meta: { changes: 1 } };
    }
    if (sql.includes('DELETE FROM pending_r2_deletions')) {
      this.db.pending.delete(this.args[0] as string);
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('DELETE FROM auth_sessions') ||
        sql.startsWith('DELETE FROM idempotency_keys') ||
        sql.startsWith('DELETE FROM rate_limits')) {
      return { meta: { changes: 0 } };
    }
    throw new Error(`Unhandled cleanup run query: ${sql}`);
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}
