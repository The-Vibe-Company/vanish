import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashApiKey } from '../src/lib/api-key.js';
import type { Env, Tier } from '../src/types.js';
import { createSqliteD1 } from './helpers/sqlite-d1.js';

const FREE_KEY = 'vnsh_free_access_test_key';
const PRO_KEY = 'vnsh_pro_access_test_key';

describe('email allowlists and protected files', () => {
  let env: Env;
  let sqlite: DatabaseSync;
  let sentEmails: Array<{ to: string[]; text: string }>;

  beforeEach(async () => {
    const db = createSqliteD1();
    sqlite = db.sqlite;
    env = {
      DB: db.d1,
      BUCKET: new MemoryBucket() as unknown as R2Bucket,
      BASE_URL: 'http://localhost:8787',
      SELF_HOSTED: 'false',
      DEFAULT_TIER: 'free',
      ACCESS_SESSION_SECRET: 'test-access-secret-with-enough-entropy',
      RESEND_API_KEY: 're_test',
      ACCESS_EMAIL_FROM: 'Vanish <access@vanish.sh>',
    };
    await seedUser('free-user', 'free', FREE_KEY);
    await seedUser('pro-user', 'pro', PRO_KEY);

    sentEmails = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url === 'https://api.resend.com/emails') {
        sentEmails.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedUser(id: string, tier: Tier, key: string) {
    sqlite.prepare('INSERT INTO users (id, github_username, tier) VALUES (?, ?, ?)').run(id, id, tier);
    sqlite.prepare('INSERT INTO api_keys (key_hash, user_id) VALUES (?, ?)').run(await hashApiKey(key), id);
  }

  describe('migration 0004', () => {
    it('keeps existing password policies and their versions while allowing email mode', () => {
      const db = new DatabaseSync(':memory:');
      db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE users (id TEXT PRIMARY KEY);
        CREATE TABLE sites (id TEXT PRIMARY KEY, slug TEXT, deleted_at TEXT);
        CREATE TABLE uploads (id TEXT PRIMARY KEY);
        INSERT INTO sites (id) VALUES ('site-1'), ('site-2');
      `);
      db.exec(readFileSync(new URL('../migrations/0003_handoff_domains_and_access.sql', import.meta.url), 'utf8'));
      db.prepare(`INSERT INTO site_access (site_id, mode, password_hash, password_salt, policy_version)
        VALUES ('site-1', 'password', 'hash', 'salt', 7)`).run();

      db.exec(readFileSync(new URL('../migrations/0004_access_email_and_files.sql', import.meta.url), 'utf8'));

      expect(db.prepare('SELECT mode, password_hash, policy_version FROM site_access WHERE site_id = ?').get('site-1'))
        .toEqual({ mode: 'password', password_hash: 'hash', policy_version: 7 });
      expect(() => db.prepare(`INSERT INTO site_access (site_id, mode, allowed_emails) VALUES ('site-2', 'email', '["a@b.co"]')`).run())
        .not.toThrow();
      expect(() => db.prepare(`INSERT INTO upload_access (upload_id, mode) VALUES ('missing', 'link')`).run())
        .toThrow(/FOREIGN KEY/);
      expect(() => db.prepare(`UPDATE site_access SET allowed_emails = NULL WHERE site_id = 'site-2'`).run())
        .toThrow(/CHECK/);
      db.close();
    });
  });

  describe('sites restricted to emails', () => {
    it('emails a one-time code to allowed addresses and signs them in', async () => {
      const site = await publishSite(PRO_KEY, { mode: 'email', emails: ['Ana@Example.com'] });
      expect(site.access).toMatchObject({ mode: 'email', emailCount: 1 });

      const gate = await request(`/s/${site.id}/app.js`);
      expect(gate.headers.get('X-Vanish-Access')).toBe('email-required');
      expect(gate.headers.get('Cache-Control')).toBe('private, no-store');
      const gateHtml = await gate.text();
      expect(gateHtml).toContain('action="/.vanish/access/request-code"');
      expect(gateHtml).not.toContain('window.secret');

      const requested = await form('/.vanish/access/request-code', { site: site.id, email: 'ana@example.com', return: `/s/${site.id}/app.js` });
      expect(requested.status).toBe(200);
      expect(sentEmails.map(email => email.to)).toEqual([['ana@example.com']]);
      const code = sentEmails[0].text.match(/\b(\d{6})\b/)![1];

      const wrong = await form('/.vanish/access/verify-code', { site: site.id, email: 'ana@example.com', code: code === '000000' ? '111111' : '000000' });
      expect(wrong.status).toBe(401);

      const verified = await form('/.vanish/access/verify-code', { site: site.id, email: 'ana@example.com', code, return: `/s/${site.id}/app.js` });
      expect(verified.status).toBe(303);
      expect(verified.headers.get('Location')).toBe(`/s/${site.id}/app.js`);
      const cookie = verified.headers.get('Set-Cookie')!.split(';')[0];

      const asset = await request(`/s/${site.id}/app.js`, { headers: { Cookie: cookie } });
      expect(await asset.text()).toBe('window.secret = true;');

      // Codes are single use.
      expect((await form('/.vanish/access/verify-code', { site: site.id, email: 'ana@example.com', code })).status).toBe(401);
    });

    it('answers the same way for addresses that are not allowed, without sending email', async () => {
      const site = await publishSite(PRO_KEY, { mode: 'email', emails: ['ana@example.com'] });

      const allowed = await form('/.vanish/access/request-code', { site: site.id, email: 'ana@example.com' });
      const denied = await form('/.vanish/access/request-code', { site: site.id, email: 'mallory@example.com' });

      expect(denied.status).toBe(allowed.status);
      expect((await denied.text()).replace(/mallory@example\.com/g, 'X')).toBe((await allowed.text()).replace(/ana@example\.com/g, 'X'));
      expect(sentEmails.map(email => email.to[0])).toEqual(['ana@example.com']);
    });

    it('locks a code after five wrong attempts', async () => {
      const site = await publishSite(PRO_KEY, { mode: 'email', emails: ['ana@example.com'] });
      await form('/.vanish/access/request-code', { site: site.id, email: 'ana@example.com' });
      const code = sentEmails[0].text.match(/\b(\d{6})\b/)![1];
      const wrongCode = code === '999999' ? '888888' : '999999';

      for (let i = 0; i < 5; i++) {
        await form('/.vanish/access/verify-code', { site: site.id, email: 'ana@example.com', code: wrongCode });
      }
      expect((await form('/.vanish/access/verify-code', { site: site.id, email: 'ana@example.com', code })).status).toBe(401);
    });

    it('caps code attempts even when guesses arrive in parallel', async () => {
      const site = await publishSite(PRO_KEY, { mode: 'email', emails: ['ana@example.com'] });
      await form('/.vanish/access/request-code', { site: site.id, email: 'ana@example.com' });
      const code = sentEmails[0].text.match(/\b(\d{6})\b/)![1];
      const wrongCode = code === '999999' ? '888888' : '999999';

      await Promise.all(Array.from({ length: 8 }, () =>
        form('/.vanish/access/verify-code', { site: site.id, email: 'ana@example.com', code: wrongCode })));

      const row = sqlite.prepare('SELECT attempts FROM access_codes').get() as { attempts: number };
      expect(row.attempts).toBe(5);
      expect((await form('/.vanish/access/verify-code', { site: site.id, email: 'ana@example.com', code })).status).toBe(401);
    });

    it('does not reveal allowed addresses when email delivery fails', async () => {
      const site = await publishSite(PRO_KEY, { mode: 'email', emails: ['ana@example.com'] });
      vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })));

      const allowed = await form('/.vanish/access/request-code', { site: site.id, email: 'ana@example.com' });
      const denied = await form('/.vanish/access/request-code', { site: site.id, email: 'mallory@example.com' });
      expect(allowed.status).toBe(200);
      expect(denied.status).toBe(200);
    });

    it('signs everyone out when the allowlist changes', async () => {
      const site = await publishSite(PRO_KEY, { mode: 'email', emails: ['ana@example.com', 'bo@example.com'] });
      const cookie = await signInByEmail({ site: site.id }, 'ana@example.com');
      expect((await request(`/s/${site.id}/`, { headers: { Cookie: cookie } })).status).toBe(200);

      const change = await api(PRO_KEY, `/sites/${site.id}/access`, { method: 'PATCH', body: { mode: 'email', emails: ['bo@example.com'] } });
      expect(change.status).toBe(200);
      expect(await change.json()).toMatchObject({ mode: 'email', emailCount: 1, allowedEmails: ['bo@example.com'] });

      const after = await request(`/s/${site.id}/`, { headers: { Cookie: cookie } });
      expect(after.headers.get('X-Vanish-Access')).toBe('email-required');
    });

    it('returns the allowlist to the owner only', async () => {
      const site = await publishSite(PRO_KEY, { mode: 'email', emails: ['ana@example.com'] });
      expect(await (await api(PRO_KEY, `/sites/${site.id}/access`)).json())
        .toMatchObject({ mode: 'email', allowedEmails: ['ana@example.com'] });
      expect((await api(FREE_KEY, `/sites/${site.id}/access`)).status).toBe(403);
    });

    it('reserves email allowlists for Pro and needs Resend configured', async () => {
      const draft = await createDraft(FREE_KEY);
      const free = await api(FREE_KEY, `/sites/${draft.id}/publish`, {
        method: 'POST',
        headers: { 'X-Site-Token': draft.token },
        body: { access: { mode: 'email', emails: ['ana@example.com'] } },
      });
      expect(free.status).toBe(403);
      expect(await free.json()).toMatchObject({ code: 'email_access_requires_pro' });

      env.RESEND_API_KEY = undefined;
      const proDraft = await createDraft(PRO_KEY);
      const unconfigured = await api(PRO_KEY, `/sites/${proDraft.id}/publish`, {
        method: 'POST',
        headers: { 'X-Site-Token': proDraft.token },
        body: { access: { mode: 'email', emails: ['ana@example.com'] } },
      });
      expect(unconfigured.status).toBe(503);
    });

    it('rejects invalid allowlists', async () => {
      const site = await publishSite(PRO_KEY, { mode: 'password', password: 'client-secret' });
      const response = await api(PRO_KEY, `/sites/${site.id}/access`, { method: 'PATCH', body: { mode: 'email', emails: ['not-an-email'] } });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'invalid_emails' });
    });

    it('lists the access mode', async () => {
      const site = await publishSite(PRO_KEY, { mode: 'email', emails: ['ana@example.com'] });
      const list = await (await api(PRO_KEY, '/sites')).json() as { sites: Array<{ id: string; access_mode: string }> };
      expect(list.sites.find(s => s.id === site.id)?.access_mode).toBe('email');
    });
  });

  describe('protected files', () => {
    it('protects an upload from creation and unlocks only that file', async () => {
      const first = await upload(FREE_KEY, 'report.pdf', '%PDF-secret', { 'X-Access-Mode': 'password', 'X-Access-Password': 'client-secret' });
      const second = await upload(FREE_KEY, 'other.pdf', '%PDF-other', { 'X-Access-Mode': 'password', 'X-Access-Password': 'client-secret' });
      expect(first.access).toMatchObject({ uploadId: first.id, mode: 'password', passwordConfigured: true });

      const gate = await request(`/f/${first.id}.pdf`);
      expect(gate.headers.get('X-Vanish-Access')).toBe('password-required');
      expect(gate.headers.get('Cache-Control')).toBe('private, no-store');
      const gateHtml = await gate.text();
      expect(gateHtml).toContain(`name="upload" value="${first.id}"`);
      expect(gateHtml).not.toContain('%PDF-secret');

      const signIn = await form('/.vanish/access', { upload: first.id, password: 'client-secret', return: `/f/${first.id}.pdf` });
      expect(signIn.status).toBe(303);
      expect(signIn.headers.get('Location')).toBe(`/f/${first.id}.pdf`);
      expect(signIn.headers.get('Set-Cookie')).toContain('Path=/f/;');
      const cookie = signIn.headers.get('Set-Cookie')!.split(';')[0];

      const file = await request(`/f/${first.id}.pdf`, { headers: { Cookie: cookie } });
      expect(file.status).toBe(200);
      expect(await file.text()).toBe('%PDF-secret');
      expect(file.headers.get('Cache-Control')).toBe('private, no-store');

      const other = await request(`/f/${second.id}.pdf`, { headers: { Cookie: cookie } });
      expect(other.headers.get('X-Vanish-Access')).toBe('password-required');
    });

    it('does not accept a site session for a file with the same id', async () => {
      const file = await upload(FREE_KEY, 'report.pdf', '%PDF-secret', { 'X-Access-Mode': 'password', 'X-Access-Password': 'client-secret' });
      const { createAccessCookie } = await import('../src/lib/site-access.js');
      const policy = sqlite.prepare('SELECT policy_version FROM upload_access WHERE upload_id = ?').get(file.id) as { policy_version: number };
      const siteCookie = (await createAccessCookie(file.id, policy.policy_version, env.ACCESS_SESSION_SECRET!)).split(';')[0];
      const forged = siteCookie.replace('vnsh_access_', 'vnsh_file_access_');

      const response = await request(`/f/${file.id}.pdf`, { headers: { Cookie: forged } });
      expect(response.headers.get('X-Vanish-Access')).toBe('password-required');
    });

    it('accepts percent-encoded non-ASCII passwords', async () => {
      const file = await upload(FREE_KEY, 'note.txt', 'hello', {
        'X-Access-Mode': 'password',
        'X-Access-Password': encodeURIComponent('mot de passe été'),
      });
      const signIn = await form('/.vanish/access', { upload: file.id, password: 'mot de passe été' });
      expect(signIn.status).toBe(303);
    });

    it('restricts a file to emails for Pro', async () => {
      const file = await upload(PRO_KEY, 'deck.pdf', '%PDF-deck', { 'X-Access-Mode': 'email', 'X-Access-Emails': 'ana@example.com, bo@example.com' });
      expect(file.access).toMatchObject({ mode: 'email', emailCount: 2 });

      const gate = await request(`/f/${file.id}.pdf`);
      expect(gate.headers.get('X-Vanish-Access')).toBe('email-required');

      const cookie = await signInByEmail({ upload: file.id }, 'bo@example.com');
      expect(await (await request(`/f/${file.id}.pdf`, { headers: { Cookie: cookie } })).text()).toBe('%PDF-deck');
    });

    it('lets the owner change file access and revokes sessions', async () => {
      const file = await upload(FREE_KEY, 'report.pdf', '%PDF-secret', { 'X-Access-Mode': 'password', 'X-Access-Password': 'client-secret' });
      const signIn = await form('/.vanish/access', { upload: file.id, password: 'client-secret' });
      const cookie = signIn.headers.get('Set-Cookie')!.split(';')[0];

      const change = await api(FREE_KEY, `/uploads/${file.id}/access`, { method: 'PATCH', body: { mode: 'password', password: 'another-secret' } });
      expect(change.status).toBe(200);
      expect((await request(`/f/${file.id}.pdf`, { headers: { Cookie: cookie } })).headers.get('X-Vanish-Access')).toBe('password-required');

      expect((await api(FREE_KEY, `/uploads/${file.id}.pdf/access`, { method: 'PATCH', body: { mode: 'link' } })).status).toBe(200);
      const open = await request(`/f/${file.id}.pdf`);
      expect(open.status).toBe(200);
      expect(open.headers.get('Cache-Control')).toBe('public, max-age=3600');

      expect((await api(PRO_KEY, `/uploads/${file.id}/access`, { method: 'PATCH', body: { mode: 'link' } })).status).toBe(403);
    });

    it('shows file access in the uploads list', async () => {
      const file = await upload(FREE_KEY, 'report.pdf', '%PDF-secret', { 'X-Access-Mode': 'password', 'X-Access-Password': 'client-secret' });
      const list = await (await api(FREE_KEY, '/uploads')).json() as { uploads: Array<{ id: string; access_mode: string }> };
      expect(list.uploads.find(u => u.id === file.id)?.access_mode).toBe('password');
    });

    it('refuses protection on anonymous uploads without storing the file', async () => {
      const response = await request('/upload', {
        method: 'POST',
        headers: { 'X-Filename': 'a.png', 'X-Access-Mode': 'password', 'X-Access-Password': 'client-secret' },
        body: 'png',
      });
      expect(response.status).toBe(401);
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM uploads').get()).toEqual({ n: 0 });
    });

    it('sandboxes active content that is served as an attachment', async () => {
      const html = await upload(FREE_KEY, 'page.html', '<script>1</script>');
      const pdf = await upload(FREE_KEY, 'doc.pdf', '%PDF-1');
      expect((await request(`/f/${html.id}.html`)).headers.get('Content-Security-Policy')).toBe('sandbox');
      expect((await request(`/f/${pdf.id}.pdf`)).headers.get('Content-Security-Policy')).toBeNull();
    });
  });

  // --- helpers -----------------------------------------------------------

  async function createDraft(key: string) {
    const created = await api(key, '/sites', { method: 'POST', body: { rootPath: 'index.html', fileCount: 2, totalBytes: 60 } });
    expect(created.status).toBe(201);
    const draft = await created.json() as { id: string; token: string };
    await putSiteFile(key, draft, 'index.html', '<h1>secret page</h1>');
    await putSiteFile(key, draft, 'app.js', 'window.secret = true;');
    return draft;
  }

  async function publishSite(key: string, access: Record<string, unknown>) {
    const draft = await createDraft(key);
    const published = await api(key, `/sites/${draft.id}/publish`, {
      method: 'POST',
      headers: { 'X-Site-Token': draft.token },
      body: { access },
    });
    expect(published.status).toBe(200);
    const body = await published.json() as { access: Record<string, unknown> };
    return { id: draft.id, access: body.access };
  }

  async function putSiteFile(key: string, draft: { id: string; token: string }, path: string, content: string) {
    const response = await request(`/sites/${draft.id}/files?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${key}`, 'X-Site-Token': draft.token, 'Content-Type': 'application/octet-stream' },
      body: content,
    });
    expect(response.status).toBe(200);
  }

  async function upload(key: string, filename: string, content: string, headers: Record<string, string> = {}) {
    const response = await request('/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'X-Filename': filename, 'Content-Type': 'application/octet-stream', ...headers },
      body: content,
    });
    expect(response.status).toBe(201);
    return await response.json() as { id: string; access?: Record<string, unknown> };
  }

  async function signInByEmail(target: { site: string } | { upload: string }, email: string): Promise<string> {
    const before = sentEmails.length;
    await form('/.vanish/access/request-code', { ...target, email });
    const code = sentEmails[before].text.match(/\b(\d{6})\b/)![1];
    const verified = await form('/.vanish/access/verify-code', { ...target, email, code });
    expect(verified.status).toBe(303);
    return verified.headers.get('Set-Cookie')!.split(';')[0];
  }

  function api(key: string, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    return request(path, {
      method: init.method || 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  }

  function form(path: string, fields: Record<string, string>) {
    return request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
  }

  async function request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (typeof init.body === 'string') {
      headers.set('Content-Length', String(new TextEncoder().encode(init.body).byteLength));
    }
    const pending: Promise<unknown>[] = [];
    const response = await worker.fetch(new Request(`http://localhost:8787${path}`, { ...init, headers }), env, {
      waitUntil: (promise: Promise<unknown>) => { pending.push(Promise.resolve(promise).catch(() => undefined)); },
      passThroughOnException: () => undefined,
    } as unknown as ExecutionContext);
    await Promise.all(pending);
    return response;
  }
});

class MemoryBucket {
  objects = new Map<string, ArrayBuffer>();

  async put(key: string, body: ArrayBuffer | ReadableStream | string) {
    this.objects.set(key, await new Response(body as BodyInit).arrayBuffer());
    return {};
  }

  async get(key: string) {
    const object = this.objects.get(key);
    return object ? { body: new Response(object).body } : null;
  }

  async head(key: string) {
    return this.objects.has(key) ? {} : null;
  }

  async delete(key: string | string[]) {
    for (const k of Array.isArray(key) ? key : [key]) this.objects.delete(k);
  }

  async list() {
    return { objects: [], truncated: false };
  }
}
