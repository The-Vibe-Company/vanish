import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../src/index.js';
import { hashApiKey } from '../src/middleware/auth.js';
import type { Env, Site, SiteFile, Tier, User } from '../src/types.js';

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

    expect(draft.slug).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]{2}$/);
    expect(draft.url).toBe(`http://localhost:8787/s/${draft.slug}/`);

    const root = await request(env, `/s/${draft.id}/`);
    expect(root.status).toBe(200);
    expect(root.headers.get('Content-Type')).toContain('text/html');
    expect(root.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    expect(root.headers.get('Link')).toContain('mailto:abuse@vanish.sh');
    expect(await root.text()).toBe('<h1>ok</h1>');

    const asset = await request(env, `/s/${draft.id}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('Content-Type')).toContain('application/javascript');
    expect(await asset.text()).toBe('window.ok = true;');
  });

  it('adds Vanish branding to browser navigations for site HTML', async () => {
    const draft = await createSite(env, {
      rootPath: 'index.html',
      fileCount: 1,
      totalBytes: 11,
    });
    await uploadSiteFile(env, draft.id, draft.token, 'index.html', '<h1>ok</h1>');
    await request(env, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: { 'X-Site-Token': draft.token },
    });

    const response = await request(env, `/s/${draft.id}/`, {
      headers: browserHeaders(),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Vary')).toContain('Sec-Fetch-Dest');
    expect(html).toContain('<h1>ok</h1>');
    expect(html).toContain('id="vanish-overlay"');
    expect(html).toContain('id="vanish-overlay-dismiss"');
    expect(html).toContain("localStorage.setItem(k,'1')");
    expect(html).toContain('Vanishes ');
    expect(html).toContain('vanish.sh');

    const raw = await request(env, `/s/${draft.id}/?raw=1`, {
      headers: browserHeaders(),
    });
    expect(await raw.text()).toBe('<h1>ok</h1>');
  });

  it('serves a branded browser viewer for non-HTML site roots', async () => {
    const draft = await createSite(env, {
      rootPath: 'report.pdf',
      fileCount: 1,
      totalBytes: 6,
    });
    await uploadSiteFile(env, draft.id, draft.token, 'report.pdf', '%PDF-1');
    await request(env, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: { 'X-Site-Token': draft.token },
    });

    const response = await request(env, `/s/${draft.id}/`, {
      headers: browserHeaders(),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(html).toContain('<iframe');
    expect(html).toContain('report.pdf');
    expect(html).toContain('?raw=1');
    expect(html).toContain('id="vanish-overlay"');

    const raw = await request(env, `/s/${draft.id}/?raw=1`, {
      headers: browserHeaders(),
    });
    expect(raw.headers.get('Content-Type')).toContain('application/pdf');
    expect(await raw.text()).toBe('%PDF-1');
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

  it('lets an authenticated owner replace a published site at the same URL', async () => {
    const key = await addUser(db, 'user1', 'free');
    const draft = await createSite(env, {
      rootPath: 'index.html',
      fileCount: 2,
      totalBytes: 48,
    }, key);
    await uploadSiteFile(env, draft.id, draft.token, 'index.html', '<h1>old</h1>', key);
    await uploadSiteFile(env, draft.id, draft.token, 'old.js', 'old', key);
    const oldKeys = Array.from(bucket.objects.keys());
    await request(env, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: authHeaders(key, { 'X-Site-Token': draft.token }),
    });

    const replacement = await request(env, `/sites/${draft.id}/replacements`, {
      method: 'POST',
      headers: authHeaders(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ rootPath: 'index.html', fileCount: 2, totalBytes: 50 }),
    });
    expect(replacement.status).toBe(201);
    const replacementDraft = await replacement.json() as { id: string; token: string };
    await uploadSiteFile(env, replacementDraft.id, replacementDraft.token, 'index.html', '<h1>new</h1>', key);
    await uploadSiteFile(env, replacementDraft.id, replacementDraft.token, 'new.css', 'body{}', key);

    const publish = await request(env, `/sites/${draft.id}/replacements/${replacementDraft.id}/publish`, {
      method: 'POST',
      headers: authHeaders(key, { 'Content-Type': 'application/json', 'X-Site-Token': replacementDraft.token }),
      body: JSON.stringify({}),
    });
    expect(publish.status).toBe(200);
    expect(await publish.json()).toMatchObject({ id: draft.id, url: draft.url });

    const root = await request(env, `/s/${draft.id}/`);
    expect(await root.text()).toBe('<h1>new</h1>');
    expect(await request(env, `/s/${draft.id}/old.js`)).toHaveProperty('status', 404);
    expect(await request(env, `/s/${draft.id}/new.css`)).toHaveProperty('status', 200);
    for (const key of oldKeys) {
      expect(bucket.objects.has(key)).toBe(false);
    }
    expect(db.pendingR2Deletions.size).toBe(0);

    const remove = await request(env, `/sites/${draft.id}`, {
      method: 'DELETE',
      headers: authHeaders(key),
    });
    expect(remove.status).toBe(200);
    expect(bucket.objects.size).toBe(0);
  });

  it('records privacy-light publish start events without paths or tokens', async () => {
    env.PRODUCT_EVENTS = 'true';
    const draft = await createSite(env, {
      rootPath: 'index.html',
      fileCount: 1,
      totalBytes: 12,
    });

    expect(db.events.map(event => event.name)).toEqual(['site_publish_started']);
    expect(db.events[0].site_id).toBe(draft.id);
    expect(db.events[0].properties).not.toContain('index.html');
    expect(db.events[0].properties).not.toContain('rootPath');
    expect(db.events[0].properties).not.toContain('token');
  });

  it('records privacy-light publish success and first-serve events without paths or tokens', async () => {
    const draft = await createSite(env, {
      rootPath: 'index.html',
      fileCount: 1,
      totalBytes: 12,
    });
    await uploadSiteFile(env, draft.id, draft.token, 'index.html', '<h1>ok</h1>');
    env.PRODUCT_EVENTS = 'true';

    const publish = await request(env, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: { 'X-Site-Token': draft.token },
    });
    expect(publish.status).toBe(200);

    await request(env, `/s/${draft.id}/`);
    await request(env, `/s/${draft.id}/`);

    expect(db.events.map(event => event.name)).toEqual([
      'site_publish_succeeded',
      'site_first_served',
    ]);
    for (const event of db.events) {
      expect(event.site_id).toBe(draft.id);
      expect(event.properties).not.toContain('index.html');
      expect(event.properties).not.toContain('rootPath');
      expect(event.properties).not.toContain('token');
    }
  });

  it('records update usage for replacement publishes', async () => {
    env.PRODUCT_EVENTS = 'true';
    const key = await addUser(db, 'user1', 'free');
    const draft = await createSite(env, { rootPath: 'index.html', fileCount: 1, totalBytes: 12 }, key);
    await uploadSiteFile(env, draft.id, draft.token, 'index.html', '<h1>old</h1>', key);
    await request(env, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: authHeaders(key, { 'X-Site-Token': draft.token }),
    });

    const replacement = await request(env, `/sites/${draft.id}/replacements`, {
      method: 'POST',
      headers: authHeaders(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ rootPath: 'index.html', fileCount: 1, totalBytes: 12 }),
    });
    const replacementDraft = await replacement.json() as { id: string; token: string };
    await uploadSiteFile(env, replacementDraft.id, replacementDraft.token, 'index.html', '<h1>new</h1>', key);

    const publish = await request(env, `/sites/${draft.id}/replacements/${replacementDraft.id}/publish`, {
      method: 'POST',
      headers: authHeaders(key, { 'Content-Type': 'application/json', 'X-Site-Token': replacementDraft.token }),
      body: JSON.stringify({}),
    });

    expect(publish.status).toBe(200);
    expect(db.events.map(event => event.name)).toContain('site_update_used');
  });

  it('keeps failed old object deletes retryable after replacement publish', async () => {
    const key = await addUser(db, 'user1', 'free');
    const draft = await createSite(env, { rootPath: 'index.html', fileCount: 1, totalBytes: 12 }, key);
    await uploadSiteFile(env, draft.id, draft.token, 'index.html', '<h1>old</h1>', key);
    const [oldKey] = Array.from(bucket.objects.keys());
    await request(env, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: authHeaders(key, { 'X-Site-Token': draft.token }),
    });
    bucket.failDeletes.add(oldKey);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const replacement = await request(env, `/sites/${draft.id}/replacements`, {
      method: 'POST',
      headers: authHeaders(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ rootPath: 'index.html', fileCount: 1, totalBytes: 12 }),
    });
    const replacementDraft = await replacement.json() as { id: string; token: string };
    await uploadSiteFile(env, replacementDraft.id, replacementDraft.token, 'index.html', '<h1>new</h1>', key);

    const publish = await request(env, `/sites/${draft.id}/replacements/${replacementDraft.id}/publish`, {
      method: 'POST',
      headers: authHeaders(key, { 'Content-Type': 'application/json', 'X-Site-Token': replacementDraft.token }),
      body: JSON.stringify({}),
    });

    expect(publish.status).toBe(200);
    expect(bucket.objects.has(oldKey)).toBe(true);
    expect(db.pendingR2Deletions.has(oldKey)).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to delete pending R2 object'), expect.any(Error));
    errorSpy.mockRestore();
  });

  it('rejects replacement updates from non-owners', async () => {
    const ownerKey = await addUser(db, 'owner', 'free');
    const otherKey = await addUser(db, 'other', 'free');
    const draft = await createSite(env, { rootPath: 'index.html', fileCount: 1, totalBytes: 12 }, ownerKey);
    await uploadSiteFile(env, draft.id, draft.token, 'index.html', 'ok', ownerKey);
    await request(env, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: authHeaders(ownerKey, { 'X-Site-Token': draft.token }),
    });

    const response = await request(env, `/sites/${draft.id}/replacements`, {
      method: 'POST',
      headers: authHeaders(otherKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ rootPath: 'index.html', fileCount: 1, totalBytes: 12 }),
    });

    expect(response.status).toBe(403);
  });

  it('keeps custom slug and retention changes pro-only for updates', async () => {
    const key = await addUser(db, 'user1', 'free');
    const draft = await createSite(env, { rootPath: 'index.html', fileCount: 1, totalBytes: 12 }, key);
    await uploadSiteFile(env, draft.id, draft.token, 'index.html', 'ok', key);
    await request(env, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: authHeaders(key, { 'X-Site-Token': draft.token }),
    });

    const response = await request(env, `/sites/${draft.id}/replacements`, {
      method: 'POST',
      headers: authHeaders(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ rootPath: 'index.html', fileCount: 1, totalBytes: 12, slug: 'custom-demo' }),
    });

    expect(response.status).toBe(403);
  });

  it('lets pro owners patch slug and retention and rejects slug conflicts', async () => {
    const key = await addUser(db, 'user1', 'pro');
    const first = await createSite(env, { rootPath: 'index.html', fileCount: 1, totalBytes: 12 }, key);
    await uploadSiteFile(env, first.id, first.token, 'index.html', 'one', key);
    await request(env, `/sites/${first.id}/publish`, {
      method: 'POST',
      headers: authHeaders(key, { 'X-Site-Token': first.token }),
    });
    const second = await createSite(env, { rootPath: 'index.html', fileCount: 1, totalBytes: 12 }, key);

    const patch = await request(env, `/sites/${first.id}`, {
      method: 'PATCH',
      headers: authHeaders(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ slug: 'custom-demo', days: 90 }),
    });
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({ slug: 'custom-demo' });

    const conflict = await request(env, `/sites/${second.id}`, {
      method: 'PATCH',
      headers: authHeaders(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ slug: 'custom-demo' }),
    });
    expect(conflict.status).toBe(409);
  });

  it('rejects custom slugs that collide with active site IDs', async () => {
    const key = await addUser(db, 'user1', 'pro');
    const first = await createSite(env, { rootPath: 'index.html', fileCount: 1, totalBytes: 12 }, key);
    const second = await createSite(env, { rootPath: 'index.html', fileCount: 1, totalBytes: 12 }, key);

    const response = await request(env, `/sites/${first.id}`, {
      method: 'PATCH',
      headers: authHeaders(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ slug: second.id }),
    });

    expect(response.status).toBe(409);
  });

  it('rejects config-only root updates when the file is missing', async () => {
    const key = await addUser(db, 'user1', 'free');
    const draft = await createSite(env, { rootPath: 'index.html', fileCount: 1, totalBytes: 12 }, key);
    await uploadSiteFile(env, draft.id, draft.token, 'index.html', 'ok', key);
    await request(env, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: authHeaders(key, { 'X-Site-Token': draft.token }),
    });

    const response = await request(env, `/sites/${draft.id}`, {
      method: 'PATCH',
      headers: authHeaders(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ rootPath: 'missing.html' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Root file not found: missing.html' });
  });
});

async function createSite(env: Env, body: { rootPath: string; fileCount: number; totalBytes: number }, apiKey?: string) {
  const response = await request(env, '/sites', {
    method: 'POST',
    headers: authHeaders(apiKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ id: string; token: string; slug: string; url: string }>;
}

async function uploadSiteFile(env: Env, siteId: string, token: string, path: string, body: string, apiKey?: string) {
  const response = await request(env, `/sites/${siteId}/files?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: authHeaders(apiKey, { 'X-Site-Token': token, 'Content-Type': 'application/octet-stream' }),
    body,
  });
  expect(response.status).toBe(200);
}

async function addUser(db: FakeDB, id: string, tier: Tier): Promise<string> {
  const apiKey = `vnsh_${id}`;
  const keyHash = await hashApiKey(apiKey);
  const user: User = {
    id,
    github_id: null,
    email: null,
    github_username: id,
    tier,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.users.set(id, user);
  db.apiKeys.set(keyHash, user);
  return apiKey;
}

function authHeaders(apiKey: string | undefined, headers: Record<string, string> = {}): Record<string, string> {
  return apiKey ? { ...headers, Authorization: `Bearer ${apiKey}` } : headers;
}

function browserHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    ...headers,
  };
}

async function request(env: Env, path: string, init?: RequestInit) {
  const waitUntilPromises: Promise<unknown>[] = [];
  const response = await worker.fetch(new Request(`http://localhost:8787${path}`, init), env, {
    waitUntil: promise => {
      waitUntilPromises.push(Promise.resolve(promise));
    },
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext);
  await Promise.all(waitUntilPromises);
  return response;
}

class FakeBucket {
  objects = new Map<string, { body: ArrayBuffer; contentType?: string }>();
  failDeletes = new Set<string>();

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
    if (this.failDeletes.has(key)) {
      throw new Error(`delete failed: ${key}`);
    }
    this.objects.delete(key);
  }
}

class FakeDB {
  sites = new Map<string, Site>();
  siteFiles = new Map<string, SiteFile>();
  users = new Map<string, User>();
  apiKeys = new Map<string, User>();
  pendingR2Deletions = new Set<string>();
  rateLimits: Array<{ identifier: string; action: string }> = [];
  events: Array<{ id: string; name: string; user_id: string | null; site_id: string | null; upload_id: string | null; properties: string }> = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
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

    if (sql.includes('FROM api_keys ak JOIN users u')) {
      const [keyHash] = this.args as [string];
      return (this.db.apiKeys.get(keyHash) || null) as T | null;
    }

    if (sql.includes('SELECT COUNT(*) as count FROM rate_limits')) {
      const [identifier, action] = this.args as [string, string];
      return { count: this.db.rateLimits.filter(r => r.identifier === identifier && r.action === action).length } as T;
    }

    if (sql.includes('SELECT COUNT(*) as count FROM sites') && sql.includes('published_at IS NOT NULL')) {
      const [userId] = this.args as [string];
      return {
        count: Array.from(this.db.sites.values()).filter(site =>
          site.user_id === userId && site.deleted_at === null && site.published_at !== null
        ).length,
      } as T;
    }

    if (sql.includes('SELECT id FROM events')) {
      const [name, siteId] = this.args as [string, string];
      const event = this.db.events.find(e => e.name === name && e.site_id === siteId);
      return (event ? { id: event.id } : null) as T | null;
    }

    if (sql.includes('SELECT id FROM sites WHERE slug = ?')) {
      const [slug] = this.args as [string];
      return (Array.from(this.db.sites.values()).find(site => site.slug === slug && site.deleted_at === null) || null) as T | null;
    }

    if (sql.includes('FROM sites WHERE slug = ? AND deleted_at IS NULL')) {
      const [slug] = this.args as [string];
      return (Array.from(this.db.sites.values()).find(site => site.slug === slug && site.deleted_at === null) || null) as T | null;
    }

    if (sql.includes('FROM sites WHERE id = ?') && sql.includes('published_at IS NOT NULL')) {
      const [id] = this.args as [string];
      const site = this.db.sites.get(id);
      return (site && site.deleted_at === null && site.published_at !== null ? site : null) as T | null;
    }

    if (sql.includes('FROM sites WHERE slug = ?') && sql.includes('published_at IS NOT NULL')) {
      const [slug] = this.args as [string];
      return (Array.from(this.db.sites.values()).find(site =>
        site.slug === slug && site.deleted_at === null && site.published_at !== null
      ) || null) as T | null;
    }

    if (sql.includes('FROM sites WHERE id = ? AND deleted_at IS NULL')) {
      const [id] = this.args as [string];
      const site = this.db.sites.get(id);
      return (site && site.deleted_at === null ? site : null) as T | null;
    }

    if (sql.includes('FROM sites WHERE (id = ? OR slug = ?)')) {
      const [id, slug] = this.args as [string, string];
      const site = Array.from(this.db.sites.values()).find(s =>
        (s.id === id || s.slug === slug) && s.deleted_at === null &&
        (!sql.includes('published_at IS NOT NULL') || s.published_at !== null)
      );
      return (site || null) as T | null;
    }

    if (sql.includes('SELECT COALESCE(SUM(size_bytes), 0) as total_bytes FROM uploads')) {
      return { total_bytes: 0 } as T;
    }

    if (sql.includes('SELECT COALESCE(SUM(size_bytes), 0) as total_bytes FROM sites')) {
      const [userId] = this.args as [string];
      const total = Array.from(this.db.sites.values())
        .filter(site => site.user_id === userId && site.deleted_at === null)
        .reduce((sum, site) => sum + site.size_bytes, 0);
      return { total_bytes: total } as T;
    }

    if (sql.includes('SELECT COALESCE(size_bytes, 0) as size_bytes FROM sites')) {
      const [siteId, userId] = this.args as [string, string];
      const site = this.db.sites.get(siteId);
      return { size_bytes: site && site.user_id === userId && site.deleted_at === null ? site.size_bytes : 0 } as T;
    }

    if (sql.includes('SELECT COALESCE(size_bytes, 0) as size_bytes FROM bundles')) {
      return { size_bytes: 0 } as T;
    }

    if (sql.includes('SELECT COALESCE(SUM(size_bytes), 0) as total_bytes FROM bundles')) {
      return { total_bytes: 0 } as T;
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

    if (sql.includes('SELECT r2_key FROM pending_r2_deletions')) {
      return {
        results: Array.from(this.db.pendingR2Deletions).map(r2_key => ({ r2_key })).slice(0, 100) as T[],
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

    if (sql.includes('INSERT INTO events')) {
      const [id, name, userId, siteId, uploadId, properties] = this.args as [
        string,
        string,
        string | null,
        string | null,
        string | null,
        string,
      ];
      this.db.events.push({
        id,
        name,
        user_id: userId,
        site_id: siteId,
        upload_id: uploadId,
        properties,
      });
      return;
    }

    if (sql.includes('UPDATE api_keys SET last_used_at')) {
      return;
    }

    if (sql.includes('INSERT OR IGNORE INTO pending_r2_deletions')) {
      const [key] = this.args as [string];
      this.db.pendingR2Deletions.add(key);
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
      this.assertUniqueSlug(slug);
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

    if (sql.includes('INSERT OR REPLACE INTO site_files') && sql.includes('SELECT ?, path')) {
      const [targetId, draftId] = this.args as [string, string];
      for (const file of Array.from(this.db.siteFiles.values()).filter(f => f.site_id === draftId)) {
        this.db.siteFiles.set(`${targetId}:${file.path}`, {
          ...file,
          site_id: targetId,
        });
      }
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

    if (sql.includes('UPDATE sites SET root_path = ?, slug = ?, expires_at = ?')) {
      const [rootPath, slug, expiresAt, siteId] = this.args as [string, string | null, string | null, string];
      const site = this.db.sites.get(siteId);
      if (site) {
        this.assertUniqueSlug(slug, siteId);
        site.root_path = rootPath;
        site.slug = slug;
        site.expires_at = expiresAt;
      }
      return;
    }

    if (sql === 'DELETE FROM site_files WHERE site_id = ?') {
      const [siteId] = this.args as [string];
      for (const file of Array.from(this.db.siteFiles.values())) {
        if (file.site_id === siteId) {
          this.db.siteFiles.delete(`${siteId}:${file.path}`);
        }
      }
      return;
    }

    if (sql.includes('DELETE FROM site_files WHERE site_id = ? AND path NOT IN')) {
      const [targetId, draftId] = this.args as [string, string];
      const draftPaths = new Set(
        Array.from(this.db.siteFiles.values())
          .filter(file => file.site_id === draftId)
          .map(file => file.path)
      );
      for (const file of Array.from(this.db.siteFiles.values()).filter(f => f.site_id === targetId)) {
        if (!draftPaths.has(file.path)) {
          this.db.siteFiles.delete(`${targetId}:${file.path}`);
        }
      }
      return;
    }

    if (sql === 'UPDATE site_files SET site_id = ? WHERE site_id = ?') {
      const [targetId, draftId] = this.args as [string, string];
      for (const file of Array.from(this.db.siteFiles.values()).filter(f => f.site_id === draftId)) {
        this.db.siteFiles.delete(`${draftId}:${file.path}`);
        this.db.siteFiles.set(`${targetId}:${file.path}`, {
          ...file,
          site_id: targetId,
        });
      }
      return;
    }

    if (sql.includes('UPDATE sites SET name = ?, root_path = ?, slug = ?, size_bytes = ?')) {
      const [name, rootPath, slug, sizeBytes, fileCount, expectedFileCount, expiresAt, siteId] = this.args as [
        string,
        string,
        string | null,
        number,
        number,
        number,
        string | null,
        string,
      ];
      const site = this.db.sites.get(siteId);
      if (site) {
        this.assertUniqueSlug(slug, siteId);
        site.name = name;
        site.root_path = rootPath;
        site.slug = slug;
        site.size_bytes = sizeBytes;
        site.file_count = fileCount;
        site.expected_file_count = expectedFileCount;
        site.expires_at = expiresAt;
        site.upload_token = null;
      }
      return;
    }

    if (sql.includes('DELETE FROM pending_r2_deletions WHERE r2_key = ?')) {
      const [key] = this.args as [string];
      this.db.pendingR2Deletions.delete(key);
      return;
    }

    if (sql.includes('UPDATE sites SET upload_token = NULL, size_bytes = 0')) {
      const [siteId] = this.args as [string];
      const site = this.db.sites.get(siteId);
      if (site) {
        site.upload_token = null;
        site.size_bytes = 0;
        site.file_count = 0;
        site.deleted_at = new Date().toISOString();
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

  private assertUniqueSlug(slug: string | null, currentSiteId?: string): void {
    if (!slug) return;

    const idMatch = this.db.sites.get(slug);
    if (idMatch && idMatch.deleted_at === null) {
      throw new Error(`UNIQUE constraint failed: sites.slug conflicts with site id ${slug}`);
    }

    const slugMatch = Array.from(this.db.sites.values()).find(site =>
      site.slug === slug && site.deleted_at === null && site.id !== currentSiteId
    );
    if (slugMatch) {
      throw new Error(`UNIQUE constraint failed: sites.slug ${slug}`);
    }
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}
