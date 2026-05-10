import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import type { Env, Site, SiteFile } from '../src/types.js';

describe('site routes', () => {
  let env: Env;
  let db: FakeDB;
  let bucket: FakeBucket;

  beforeEach(() => {
    db = new FakeDB();
    bucket = new FakeBucket();
    env = {
      DB: db as unknown as D1Database,
      BUCKET: bucket as unknown as R2Bucket,
      BASE_URL: 'http://localhost:8787',
      SELF_HOSTED: 'false',
      DEFAULT_TIER: 'free',
    };
  });

  it('publishes an anonymous static site and serves root and assets', async () => {
    const draft = await createSite(env, {
      rootPath: 'index.html',
      fileCount: 2,
      totalBytes: 48,
    });

    await uploadSiteFile(env, draft.id, draft.token, 'index.html', '<h1>ok</h1>');
    await uploadSiteFile(env, draft.id, draft.token, 'assets/app.js', 'window.ok = true;');

    const publish = await request(env, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: { 'X-Site-Token': draft.token },
    });
    expect(publish.status).toBe(200);

    const root = await request(env, `/s/${draft.id}/`);
    expect(root.status).toBe(200);
    expect(root.headers.get('Content-Type')).toContain('text/html');
    expect(await root.text()).toBe('<h1>ok</h1>');

    const asset = await request(env, `/s/${draft.id}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('Content-Type')).toContain('application/javascript');
    expect(await asset.text()).toBe('window.ok = true;');
  });

  it('refuses publish when the declared root was not uploaded', async () => {
    const draft = await createSite(env, {
      rootPath: 'index.html',
      fileCount: 1,
      totalBytes: 12,
    });
    await uploadSiteFile(env, draft.id, draft.token, 'assets/app.js', 'ok');

    const publish = await request(env, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: { 'X-Site-Token': draft.token },
    });

    expect(publish.status).toBe(400);
    expect(await publish.json()).toMatchObject({ error: 'Root file not uploaded: index.html' });
  });

  it('rejects blocked extensions as site files', async () => {
    const draft = await createSite(env, {
      rootPath: 'index.html',
      fileCount: 1,
      totalBytes: 12,
    });

    const response = await request(env, `/sites/${draft.id}/files?path=${encodeURIComponent('deploy.sh')}`, {
      method: 'PUT',
      headers: { 'X-Site-Token': draft.token, 'Content-Type': 'application/octet-stream' },
      body: 'echo bad',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'File type .sh is not allowed in sites' });
  });

  it('enforces the declared file count', async () => {
    const draft = await createSite(env, {
      rootPath: 'index.html',
      fileCount: 1,
      totalBytes: 12,
    });

    await uploadSiteFile(env, draft.id, draft.token, 'index.html', 'ok');
    const extra = await request(env, `/sites/${draft.id}/files?path=${encodeURIComponent('extra.css')}`, {
      method: 'PUT',
      headers: { 'X-Site-Token': draft.token, 'Content-Type': 'application/octet-stream' },
      body: 'body{}',
    });

    expect(extra.status).toBe(413);
    expect(await extra.json()).toMatchObject({ maxFiles: 1 });
  });

  it('allows draft cleanup with the site token', async () => {
    const draft = await createSite(env, {
      rootPath: 'index.html',
      fileCount: 1,
      totalBytes: 12,
    });
    await uploadSiteFile(env, draft.id, draft.token, 'index.html', 'ok');

    const response = await request(env, `/sites/${draft.id}`, {
      method: 'DELETE',
      headers: { 'X-Site-Token': draft.token },
    });

    expect(response.status).toBe(200);
    expect(db.sites.get(draft.id)?.deleted_at).not.toBeNull();
    expect(bucket.objects.size).toBe(0);
  });
});

async function createSite(env: Env, body: { rootPath: string; fileCount: number; totalBytes: number }) {
  const response = await request(env, '/sites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ id: string; token: string }>;
}

async function uploadSiteFile(env: Env, siteId: string, token: string, path: string, body: string) {
  const response = await request(env, `/sites/${siteId}/files?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'X-Site-Token': token, 'Content-Type': 'application/octet-stream' },
    body,
  });
  expect(response.status).toBe(200);
}

function request(env: Env, path: string, init?: RequestInit) {
  return worker.fetch(new Request(`http://localhost:8787${path}`, init), env, {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext);
}

class FakeBucket {
  objects = new Map<string, { body: ArrayBuffer; contentType?: string }>();

  async put(key: string, body: ArrayBuffer, options?: R2PutOptions): Promise<void> {
    this.objects.set(key, {
      body,
      contentType: options?.httpMetadata?.contentType,
    });
  }

  async get(key: string): Promise<{ body: ReadableStream | null } | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    return { body: new Response(object.body).body };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

class FakeDB {
  sites = new Map<string, Site>();
  siteFiles = new Map<string, SiteFile>();
  rateLimits: Array<{ identifier: string; action: string }> = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]): Promise<unknown[]> {
    return Promise.all(statements.map(statement => statement.run()));
  }
}

class FakeStatement {
  private args: unknown[] = [];

  constructor(private db: FakeDB, private sql: string) {}

  bind(...args: unknown[]): FakeStatement {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const sql = normalizeSql(this.sql);

    if (sql.includes('SELECT COUNT(*) as count FROM rate_limits')) {
      const [identifier, action] = this.args as [string, string];
      return { count: this.db.rateLimits.filter(r => r.identifier === identifier && r.action === action).length } as T;
    }

    if (sql.includes('SELECT id FROM sites WHERE slug = ?')) {
      const [slug] = this.args as [string];
      return (Array.from(this.db.sites.values()).find(site => site.slug === slug && site.deleted_at === null) || null) as T | null;
    }

    if (sql.includes('FROM sites WHERE id = ? AND deleted_at IS NULL')) {
      const [id] = this.args as [string];
      const site = this.db.sites.get(id);
      return (site && site.deleted_at === null ? site : null) as T | null;
    }

    if (sql.includes('FROM sites WHERE (id = ? OR slug = ?)')) {
      const [id, slug] = this.args as [string, string];
      const site = Array.from(this.db.sites.values()).find(s =>
        (s.id === id || s.slug === slug) && s.deleted_at === null && s.published_at !== null
      );
      return (site || null) as T | null;
    }

    if (sql.includes('SELECT size_bytes FROM site_files')) {
      const [siteId, path] = this.args as [string, string];
      const file = this.db.siteFiles.get(`${siteId}:${path}`);
      return (file ? { size_bytes: file.size_bytes } : null) as T | null;
    }

    if (sql.includes('SELECT path FROM site_files')) {
      const [siteId, path] = this.args as [string, string];
      const file = this.db.siteFiles.get(`${siteId}:${path}`);
      return (file ? { path: file.path } : null) as T | null;
    }

    if (sql.includes('SELECT site_id, path, content_type, size_bytes, r2_key, created_at FROM site_files')) {
      const [siteId, path] = this.args as [string, string];
      return (this.db.siteFiles.get(`${siteId}:${path}`) || null) as T | null;
    }

    throw new Error(`Unhandled first query: ${sql}`);
  }

  async all<T>(): Promise<{ results: T[] }> {
    const sql = normalizeSql(this.sql);

    if (sql.includes('SELECT r2_key FROM site_files WHERE site_id = ?')) {
      const [siteId] = this.args as [string];
      return {
        results: Array.from(this.db.siteFiles.values())
          .filter(file => file.site_id === siteId)
          .slice(0, 100) as T[],
      };
    }

    throw new Error(`Unhandled all query: ${sql}`);
  }

  async run(): Promise<void> {
    const sql = normalizeSql(this.sql);

    if (sql.includes('INSERT INTO rate_limits')) {
      const [identifier, action] = this.args as [string, string];
      this.db.rateLimits.push({ identifier, action });
      return;
    }

    if (sql.includes('INSERT INTO sites')) {
      const [id, userId, name, rootPath, slug, uploadToken, expectedFileCount, expiresAt] = this.args as [
        string,
        string | null,
        string,
        string,
        string | null,
        string,
        number,
        string,
      ];
      this.db.sites.set(id, {
        id,
        user_id: userId,
        name,
        root_path: rootPath,
        slug,
        upload_token: uploadToken,
        size_bytes: 0,
        file_count: 0,
        expected_file_count: expectedFileCount,
        expires_at: expiresAt,
        published_at: null,
        created_at: new Date().toISOString(),
        deleted_at: null,
      });
      return;
    }

    if (sql.includes('INSERT OR REPLACE INTO site_files')) {
      const [siteId, path, contentType, sizeBytes, r2Key] = this.args as [string, string, string, number, string];
      this.db.siteFiles.set(`${siteId}:${path}`, {
        site_id: siteId,
        path,
        content_type: contentType,
        size_bytes: sizeBytes,
        r2_key: r2Key,
        created_at: new Date().toISOString(),
      });
      return;
    }

    if (sql.includes('UPDATE sites SET size_bytes =')) {
      const [siteId] = this.args as [string];
      const site = this.db.sites.get(siteId);
      if (!site) return;
      const files = Array.from(this.db.siteFiles.values()).filter(file => file.site_id === siteId);
      site.size_bytes = files.reduce((sum, file) => sum + file.size_bytes, 0);
      site.file_count = files.length;
      return;
    }

    if (sql.includes('UPDATE sites SET published_at = ?')) {
      const [publishedAt, siteId] = this.args as [string, string];
      const site = this.db.sites.get(siteId);
      if (site) {
        site.published_at = publishedAt;
        site.upload_token = null;
      }
      return;
    }

    if (sql.includes('UPDATE sites SET deleted_at = datetime')) {
      const [siteId] = this.args as [string];
      const site = this.db.sites.get(siteId);
      if (site) site.deleted_at = new Date().toISOString();
      return;
    }

    if (sql.includes('DELETE FROM site_files WHERE site_id = ? AND r2_key IN')) {
      const [siteId, ...keys] = this.args as string[];
      for (const key of keys) {
        const file = Array.from(this.db.siteFiles.values()).find(f => f.site_id === siteId && f.r2_key === key);
        if (file) this.db.siteFiles.delete(`${siteId}:${file.path}`);
      }
      return;
    }

    throw new Error(`Unhandled run query: ${sql}`);
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}
