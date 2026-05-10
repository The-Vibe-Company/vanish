import { describe, it, expect } from 'vitest';
import { ensureStorageAvailable, getActiveStorageBytes } from '../src/lib/storage.js';
import type { Env } from '../src/types.js';

describe('storage quota helpers', () => {
  it('sums active uploads and sites while excluding expired and deleted rows', async () => {
    const db = new StorageDB({
      uploads: [
        { user_id: 'user1', size_bytes: 10, expires_at: future(), deleted_at: null },
        { user_id: 'user1', size_bytes: 20, expires_at: past(), deleted_at: null },
        { user_id: 'user1', size_bytes: 30, expires_at: future(), deleted_at: '2026-01-01' },
      ],
      sites: [
        { id: 'site1', user_id: 'user1', size_bytes: 40, expires_at: future(), deleted_at: null },
        { id: 'site2', user_id: 'user1', size_bytes: 50, expires_at: past(), deleted_at: null },
      ],
    });

    await expect(getActiveStorageBytes(env(db), 'user1')).resolves.toBe(50);
  });

  it('enforces anonymous max site size', async () => {
    const result = await ensureStorageAvailable(env(new StorageDB()), 'anonymous', null, 11 * 1024 * 1024);

    expect(result).toMatchObject({ ok: false });
  });

  it('enforces free shared storage quota across uploads and sites', async () => {
    const db = new StorageDB({
      uploads: [{ user_id: 'user1', size_bytes: 45 * 1024 * 1024, expires_at: future(), deleted_at: null }],
      sites: [],
    });

    const result = await ensureStorageAvailable(env(db), 'free', 'user1', 6 * 1024 * 1024);

    expect(result).toMatchObject({ ok: false, maxTotalBytes: 50 * 1024 * 1024 });
  });

  it('excludes the current site when checking an overwrite', async () => {
    const db = new StorageDB({
      uploads: [{ user_id: 'user1', size_bytes: 45 * 1024 * 1024, expires_at: future(), deleted_at: null }],
      sites: [{ id: 'site1', user_id: 'user1', size_bytes: 4 * 1024 * 1024, expires_at: future(), deleted_at: null }],
    });

    const result = await ensureStorageAvailable(env(db), 'free', 'user1', 5 * 1024 * 1024, {
      excludeSiteId: 'site1',
    });

    expect(result).toEqual({ ok: true });
  });
});

function env(db: StorageDB): Env {
  return { DB: db as unknown as D1Database } as Env;
}

function future(): string {
  return new Date(Date.now() + 60_000).toISOString();
}

function past(): string {
  return new Date(Date.now() - 60_000).toISOString();
}

interface StorageRow {
  id?: string;
  user_id: string;
  size_bytes: number;
  expires_at: string | null;
  deleted_at: string | null;
}

class StorageDB {
  uploads: StorageRow[];
  sites: StorageRow[];

  constructor(input: { uploads?: StorageRow[]; sites?: StorageRow[] } = {}) {
    this.uploads = input.uploads || [];
    this.sites = input.sites || [];
  }

  prepare(sql: string): StorageStatement {
    return new StorageStatement(this, sql);
  }
}

class StorageStatement {
  private args: unknown[] = [];

  constructor(private db: StorageDB, private sql: string) {}

  bind(...args: unknown[]): StorageStatement {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const normalized = this.sql.replace(/\s+/g, ' ');

    if (normalized.includes('FROM uploads')) {
      const [userId] = this.args as [string];
      return { total_bytes: sumActive(this.db.uploads, userId) } as T;
    }

    if (normalized.includes('SELECT COALESCE(size_bytes, 0)')) {
      const [siteId, userId] = this.args as [string, string];
      const site = this.db.sites.find(row => row.id === siteId && row.user_id === userId && row.deleted_at === null);
      return { size_bytes: site?.size_bytes || 0 } as T;
    }

    if (normalized.includes('FROM sites')) {
      const [userId] = this.args as [string];
      return { total_bytes: sumActive(this.db.sites, userId) } as T;
    }

    throw new Error(`Unhandled query: ${normalized}`);
  }
}

function sumActive(rows: StorageRow[], userId: string): number {
  const now = Date.now();
  return rows
    .filter(row => row.user_id === userId)
    .filter(row => row.deleted_at === null)
    .filter(row => row.expires_at === null || new Date(row.expires_at).getTime() > now)
    .reduce((sum, row) => sum + row.size_bytes, 0);
}
