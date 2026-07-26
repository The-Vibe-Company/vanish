import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashApiKey } from '../src/lib/api-key.js';
import type { CustomDomain, DomainReservation, Env, Site, SiteFile, User } from '../src/types.js';

describe('domain routes', () => {
  let db: DomainDB;
  let env: Env;
  let apiKey: string;

  beforeEach(async () => {
    db = new DomainDB();
    apiKey = 'vnsh_pro-user';
    const user: User = {
      id: 'pro-user',
      github_id: null,
      email: 'pro@example.com',
      github_username: 'pro',
      tier: 'pro',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.apiKeys.set(await hashApiKey(apiKey), user);
    db.sites.set('site-one', site('site-one'));
    db.sites.set('site-two', site('site-two'));
    db.channels.set('pro-user:client-preview', 'site-one');
    db.files.set('site-one:index.html', file('site-one', 'objects/one'));
    db.files.set('site-two:index.html', file('site-two', 'objects/two'));

    env = {
      DB: db as unknown as D1Database,
      BUCKET: {
        get: async (key: string) => {
          const body = key === 'objects/two' ? '<h1>two</h1>' : '<h1>one</h1>';
          return { body: new Response(body).body };
        },
      } as unknown as R2Bucket,
      BASE_URL: 'https://vanish.sh',
      SELF_HOSTED: 'false',
      DEFAULT_TIER: 'free',
      CLOUDFLARE_API_TOKEN: 'cf-token',
      CLOUDFLARE_ZONE_ID: 'zone-1',
      CUSTOM_DOMAIN_FALLBACK_HOST: 'fallback.vanish.sh',
    };

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as { hostname?: string } : {};
      return new Response(JSON.stringify({
        success: true,
        result: {
          id: `cf-host-${body.hostname || 'existing'}`,
          hostname: body.hostname || 'preview.example.com',
          status: 'active',
          ssl: { status: 'active' },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('provisions one Pro domain and serves whichever site the stable channel targets', async () => {
    const created = await call('https://vanish.sh/domains', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hostname: 'preview.example.com', channel: 'client-preview' }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      hostname: 'preview.example.com',
      channel: 'client-preview',
      status: 'active',
      dnsRecords: [{
        type: 'CNAME',
        name: 'preview.example.com',
        value: 'fallback.vanish.sh',
      }],
    });

    const first = await call('https://preview.example.com/', { headers: { Host: 'preview.example.com' } });
    expect(first.status).toBe(200);
    expect(await first.text()).toBe('<h1>one</h1>');

    db.channels.set('pro-user:client-preview', 'site-two');
    const second = await call('https://preview.example.com/', { headers: { Host: 'preview.example.com' } });
    expect(second.status).toBe(200);
    expect(await second.text()).toBe('<h1>two</h1>');

    const duplicate = await call('https://vanish.sh/domains', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hostname: 'other.example.com', channel: 'client-preview' }),
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ code: 'domain_limit_exceeded' });
  });

  it('rejects custom domains for non-Pro users', async () => {
    const user = db.apiKeys.values().next().value as User;
    user.tier = 'free';
    const response = await call('https://vanish.sh/domains', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hostname: 'preview.example.com', channel: 'client-preview' }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'pro_required', upgradeRequired: true });
  });

  it('enforces the one-domain entitlement across concurrent create requests', async () => {
    const [first, second] = await Promise.all([
      call('https://vanish.sh/domains', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hostname: 'one.example.com', channel: 'client-preview' }),
      }),
      call('https://vanish.sh/domains', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hostname: 'two.example.com', channel: 'client-preview' }),
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(await conflict.json()).toMatchObject({ code: 'domain_limit_exceeded' });
    expect(db.domains.size).toBe(1);
  });

  it('reserves a vanish.sh namespace and serves a site on its child hostname', async () => {
    const reserved = await call('https://vanish.sh/domains/reservation', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slug: 'studio' }),
    });
    expect(reserved.status).toBe(201);
    expect(await reserved.json()).toMatchObject({
      slug: 'studio',
      hostname: 'studio.vanish.sh',
    });

    const created = await call('https://vanish.sh/domains', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hostname: 'portfolio.studio.vanish.sh',
        channel: 'client-preview',
      }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      hostname: 'portfolio.studio.vanish.sh',
      parentHostname: 'studio.vanish.sh',
      managedDns: true,
      kind: 'domain_route',
      dnsRecords: [],
    });

    const response = await call('https://portfolio.studio.vanish.sh/', {
      headers: { Host: 'portfolio.studio.vanish.sh' },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<h1>one</h1>');

    const rootCustomDomain = await call('https://vanish.sh/domains', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hostname: 'preview.example.com', channel: 'client-preview' }),
    });
    expect(rootCustomDomain.status).toBe(201);
  });

  it('allows direct child routes below an owned custom domain', async () => {
    const root = await call('https://vanish.sh/domains', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hostname: 'studio.example.com', channel: 'client-preview' }),
    });
    expect(root.status).toBe(201);

    const child = await call('https://vanish.sh/domains', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hostname: 'portfolio.studio.example.com', channel: 'client-preview' }),
    });
    expect(child.status).toBe(201);
    expect(await child.json()).toMatchObject({
      parentHostname: 'studio.example.com',
      managedDns: false,
      kind: 'domain_route',
    });
  });

  it('rejects nested vanish.sh routes outside the owned namespace', async () => {
    const response = await call('https://vanish.sh/domains', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hostname: 'portfolio.someone-else.vanish.sh',
        channel: 'client-preview',
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_hostname' });
  });

  async function call(url: string, init?: RequestInit): Promise<Response> {
    const pending: Promise<unknown>[] = [];
    const response = await worker.fetch(new Request(url, init), env, {
      waitUntil: promise => pending.push(Promise.resolve(promise)),
      passThroughOnException: () => undefined,
    } as unknown as ExecutionContext);
    await Promise.all(pending);
    return response;
  }
});

class DomainDB {
  apiKeys = new Map<string, User>();
  sites = new Map<string, Site>();
  channels = new Map<string, string>();
  files = new Map<string, SiteFile>();
  domains = new Map<string, CustomDomain>();
  reservations = new Map<string, DomainReservation>();

  prepare(sql: string): DomainStatement {
    return new DomainStatement(this, sql.replace(/\s+/g, ' ').trim());
  }
}

class DomainStatement {
  private args: unknown[] = [];

  constructor(private db: DomainDB, private sql: string) {}

  bind(...args: unknown[]): this {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes('FROM api_keys ak JOIN users u')) {
      return (this.db.apiKeys.get(String(this.args[0])) || null) as T | null;
    }
    if (this.sql.includes('FROM site_channels sc JOIN sites s')) {
      const [userId, channel] = this.args as [string, string];
      const siteId = this.db.channels.get(`${userId}:${channel}`);
      return (siteId ? this.db.sites.get(siteId) || null : null) as T | null;
    }
    if (this.sql.includes('SELECT COUNT(*) AS count FROM custom_domains')) {
      const userId = String(this.args[0]);
      const parentHostname = this.sql.includes('parent_hostname = ?') ? String(this.args[1]) : null;
      return {
        count: Array.from(this.db.domains.values()).filter(domain =>
          domain.user_id === userId &&
          domain.status !== 'deleting' &&
          (this.sql.includes('parent_hostname IS NOT NULL') ? domain.parent_hostname !== null : true) &&
          (this.sql.includes('parent_hostname IS NULL') ? domain.parent_hostname === null : true) &&
          (parentHostname ? domain.parent_hostname === parentHostname : true)
        ).length,
      } as T;
    }
    if (this.sql.includes('SELECT hostname FROM domain_reservations WHERE user_id = ? AND hostname = ?')) {
      const [userId, hostname] = this.args as [string, string];
      const reservation = this.db.reservations.get(hostname);
      return (reservation?.user_id === userId ? { hostname } : null) as T | null;
    }
    if (this.sql.includes('FROM domain_reservations WHERE user_id = ?')) {
      const userId = String(this.args[0]);
      return (Array.from(this.db.reservations.values()).find(item => item.user_id === userId) || null) as T | null;
    }
    if (this.sql.includes('SELECT id FROM sites WHERE slug = ?')) return null;
    if (this.sql.includes('SELECT hostname FROM custom_domains') && this.sql.includes('parent_hostname IS NULL')) {
      const [userId, hostname] = this.args as [string, string];
      const domain = this.db.domains.get(hostname);
      return (domain?.user_id === userId && domain.parent_hostname === null
        ? { hostname: domain.hostname }
        : null) as T | null;
    }
    if (this.sql.includes('FROM custom_domains WHERE user_id = ? AND hostname = ?')) {
      const [userId, hostname] = this.args as [string, string];
      const domain = this.db.domains.get(hostname);
      return (domain?.user_id === userId ? domain : null) as T | null;
    }
    if (this.sql.includes('SELECT s.id FROM custom_domains d')) {
      const hostname = String(this.args[0]);
      const domain = this.db.domains.get(hostname);
      if (!domain || domain.status !== 'active') return null;
      const siteId = this.db.channels.get(`${domain.user_id}:${domain.channel}`);
      return (siteId ? { id: siteId } : null) as T | null;
    }
    if (this.sql.includes('FROM sites WHERE id = ?') && this.sql.includes('published_at IS NOT NULL')) {
      return (this.db.sites.get(String(this.args[0])) || null) as T | null;
    }
    if (this.sql.includes('FROM site_access')) return null;
    if (this.sql.includes('FROM site_files WHERE site_id = ? AND path = ?')) {
      return (this.db.files.get(`${String(this.args[0])}:${String(this.args[1])}`) || null) as T | null;
    }
    throw new Error(`Unhandled first query: ${this.sql}`);
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes('FROM custom_domains WHERE user_id = ?')) {
      const userId = String(this.args[0]);
      return { results: Array.from(this.db.domains.values()).filter(domain => domain.user_id === userId) as T[] };
    }
    throw new Error(`Unhandled all query: ${this.sql}`);
  }

  async run(): Promise<void> {
    if (this.sql.includes('UPDATE api_keys SET last_used_at')) return;
    if (this.sql.includes('INSERT INTO custom_domains')) {
      const [hostname, userId, channel, parentHostname, managedDns, createdAt, updatedAt] = this.args as [
        string, string, string, string | null, number, string, string,
      ];
      if (this.db.domains.has(hostname)) throw new Error('UNIQUE constraint failed');
      if (Array.from(this.db.domains.values()).some(domain =>
        domain.user_id === userId &&
        domain.status !== 'deleting' &&
        domain.parent_hostname === null &&
        parentHostname === null
      )) {
        throw new Error('UNIQUE constraint failed: custom_domains.user_id');
      }
      this.db.domains.set(hostname, {
        hostname,
        user_id: userId,
        channel,
        parent_hostname: parentHostname,
        managed_dns: managedDns,
        provider_hostname_id: null,
        status: 'pending_dns',
        dns_records: '[]',
        last_error: null,
        verified_at: null,
        grace_expires_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return;
    }
    if (this.sql.includes('INSERT INTO domain_reservations')) {
      const [hostname, slug, userId, createdAt, updatedAt] = this.args as [string, string, string, string, string];
      if (this.db.reservations.has(hostname) || Array.from(this.db.reservations.values()).some(item => item.user_id === userId)) {
        throw new Error('UNIQUE constraint failed');
      }
      this.db.reservations.set(hostname, {
        hostname,
        slug,
        user_id: userId,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return;
    }
    if (this.sql.includes('UPDATE custom_domains SET provider_hostname_id = ?')) {
      const [providerId, status, dnsRecords, error, verifiedStatus, hostname] = this.args as [
        string,
        CustomDomain['status'],
        string,
        string | null,
        CustomDomain['status'],
        string,
      ];
      const domain = this.db.domains.get(hostname)!;
      Object.assign(domain, {
        provider_hostname_id: providerId,
        status,
        dns_records: dnsRecords,
        last_error: error,
        verified_at: verifiedStatus === 'active' ? new Date().toISOString() : null,
      });
      return;
    }
    throw new Error(`Unhandled run query: ${this.sql}`);
  }
}

function site(id: string): Site {
  return {
    id,
    user_id: 'pro-user',
    name: id,
    root_path: 'index.html',
    slug: null,
    upload_token: null,
    size_bytes: 12,
    file_count: 1,
    expected_file_count: 1,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    deleted_at: null,
  };
}

function file(siteId: string, r2Key: string): SiteFile {
  return {
    site_id: siteId,
    path: 'index.html',
    content_type: 'text/html',
    size_bytes: 12,
    r2_key: r2Key,
    created_at: new Date().toISOString(),
  };
}
