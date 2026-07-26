import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adoptOrCreateProviderHostname,
  beginDomainGrace,
  createProviderHostname,
  deleteProviderHostname,
  getProviderHostname,
  maintainCustomDomains,
  normalizeCustomHostname,
  requestCustomHostname,
  resumeDomainsAfterUpgrade,
  syncDomain,
} from '../src/lib/custom-domains.js';
import type { CustomDomain, Env } from '../src/types.js';

describe('custom domains', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts customer subdomains and rejects apex, wildcard, URL, and Vanish-owned hosts', () => {
    expect(normalizeCustomHostname('Preview.Example.com.', 'https://vanish.sh')).toBe('preview.example.com');
    expect(normalizeCustomHostname('example.com', 'https://vanish.sh')).toBeNull();
    expect(normalizeCustomHostname('example.co.uk', 'https://vanish.sh')).toBeNull();
    expect(normalizeCustomHostname('preview.example.co.uk', 'https://vanish.sh')).toBe('preview.example.co.uk');
    expect(normalizeCustomHostname('*.example.com', 'https://vanish.sh')).toBeNull();
    expect(normalizeCustomHostname('https://preview.example.com', 'https://vanish.sh')).toBeNull();
    expect(normalizeCustomHostname('preview.vanish.sh', 'https://vanish.sh')).toBeNull();
  });

  it('only treats external configured hosts as custom domain requests', () => {
    const env = configuredEnv();
    expect(requestCustomHostname(env, 'preview.example.com')).toBe('preview.example.com');
    expect(requestCustomHostname(env, 'vanish.sh')).toBeNull();
    expect(requestCustomHostname(env, 'site.vanish.sh')).toBeNull();
    expect(requestCustomHostname(env, 'portfolio.studio.vanish.sh')).toBe('portfolio.studio.vanish.sh');
    expect(requestCustomHostname({ ...env, CUSTOM_DOMAIN_FALLBACK_HOST: undefined }, 'preview.example.com')).toBeNull();
  });

  it('creates a Cloudflare hostname and returns CNAME and validation instructions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      result: {
        id: 'cf-host-1',
        hostname: 'preview.example.com',
        status: 'pending',
        ssl: { status: 'pending_validation' },
        ownership_verification: {
          type: 'txt',
          name: '_cf-custom-hostname.preview.example.com',
          value: 'validation-token',
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createProviderHostname(configuredEnv(), 'preview.example.com');

    expect(result).toEqual({
      providerId: 'cf-host-1',
      status: 'pending_dns',
      dnsRecords: [
        { type: 'CNAME', name: 'preview.example.com', value: 'fallback.vanish.sh' },
        { type: 'TXT', name: '_cf-custom-hostname.preview.example.com', value: 'validation-token' },
      ],
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/zones/zone-1/custom_hostnames',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('adopts an exact provider hostname instead of creating a duplicate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      result: [{
        id: 'cf-orphan-1',
        hostname: 'preview.example.com',
        status: 'active',
        ssl: { status: 'active' },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adoptOrCreateProviderHostname(configuredEnv(), 'preview.example.com');

    expect(result).toMatchObject({
      providerId: 'cf-orphan-1',
      status: 'active',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/zones/zone-1/custom_hostnames?hostname.exact=preview.example.com&per_page=2',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('creates a provider hostname only when no exact orphan can be adopted', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        result: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        result: {
          id: 'cf-host-new',
          hostname: 'preview.example.com',
          status: 'pending',
          ssl: { status: 'pending_validation' },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adoptOrCreateProviderHostname(configuredEnv(), 'preview.example.com');

    expect(result.providerId).toBe('cf-host-new');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
  });

  it('recovers an identifier when Cloudflare returns an ambiguous create success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        result: {
          hostname: 'preview.example.com',
          status: 'pending',
          ssl: { status: 'pending_validation' },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        result: [{
          id: 'cf-host-recovered',
          hostname: 'preview.example.com',
          status: 'pending',
          ssl: { status: 'pending_validation' },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createProviderHostname(configuredEnv(), 'preview.example.com');

    expect(result.providerId).toBe('cf-host-recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'GET' });
  });

  it('maps active TLS state and deletes the provider hostname', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        result: {
          id: 'cf-host-1',
          hostname: 'preview.example.com',
          status: 'active',
          ssl: { status: 'active' },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        result: {},
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getProviderHostname(configuredEnv(), 'cf-host-1')).toMatchObject({ status: 'active' });
    await deleteProviderHostname(configuredEnv(), 'cf-host-1');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  });

  it('uses managed HTTP validation without exposing DNS instructions for Vanish routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      result: {
        id: 'cf-host-managed',
        hostname: 'portfolio.studio.vanish.sh',
        status: 'pending',
        ssl: {
          status: 'pending_validation',
          validation_records: [{ txt_name: '_acme.example', txt_value: 'secret' }],
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createProviderHostname(
      configuredEnv(),
      'portfolio.studio.vanish.sh',
      true,
    );

    expect(result.dnsRecords).toEqual([]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      hostname: 'portfolio.studio.vanish.sh',
      ssl: { method: 'http', type: 'dv' },
    });
  });

  it('persists one stable downgrade deadline even without provider bindings', async () => {
    const statements: string[] = [];
    const env = {
      ...configuredEnv(),
      CLOUDFLARE_API_TOKEN: undefined,
      CLOUDFLARE_ZONE_ID: undefined,
      CUSTOM_DOMAIN_FALLBACK_HOST: undefined,
      DB: recordingDb(statements, []),
    };

    await beginDomainGrace(env, 'user-1');

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("COALESCE(grace_expires_at, datetime('now', '+7 days'))");
  });

  it('clears stale grace on upgrade without requiring provider bindings', async () => {
    const statements: string[] = [];
    const activeDomain: CustomDomain = {
      hostname: 'preview.example.com',
      user_id: 'user-1',
      channel: 'preview',
      parent_hostname: null,
      managed_dns: 0,
      provider_hostname_id: 'cf-host-1',
      status: 'active',
      dns_records: '[]',
      last_error: null,
      verified_at: new Date().toISOString(),
      grace_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const env = {
      ...configuredEnv(),
      CLOUDFLARE_API_TOKEN: undefined,
      CLOUDFLARE_ZONE_ID: undefined,
      CUSTOM_DOMAIN_FALLBACK_HOST: undefined,
      DB: recordingDb(statements, [activeDomain]),
    };

    await resumeDomainsAfterUpgrade(env, 'user-1');

    expect(statements.some(sql => sql.includes('SET grace_expires_at = NULL'))).toBe(true);
  });

  it('clears a stale provider id after Cloudflare reports the hostname missing', async () => {
    const statements: string[] = [];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      errors: [{ message: 'Custom hostname not found' }],
    }), { status: 404, headers: { 'Content-Type': 'application/json' } })));
    const domain: CustomDomain = {
      hostname: 'preview.example.com',
      user_id: 'user-1',
      channel: 'preview',
      parent_hostname: null,
      managed_dns: 0,
      provider_hostname_id: 'deleted-provider-id',
      status: 'error',
      dns_records: '[]',
      last_error: null,
      verified_at: null,
      grace_expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const env = {
      ...configuredEnv(),
      DB: recordingDb(statements, []),
    };

    const synced = await syncDomain(env, domain);

    expect(synced.provider_hostname_id).toBeNull();
    expect(synced.status).toBe('error');
    expect(statements.some(sql => sql.includes('SET provider_hostname_id = NULL'))).toBe(true);
  });

  it('does not let a stale provider sync overwrite a concurrent deletion', async () => {
    const domain: CustomDomain = {
      hostname: 'preview.example.com',
      user_id: 'user-1',
      channel: 'preview',
      parent_hostname: null,
      managed_dns: 0,
      provider_hostname_id: 'cf-host-1',
      status: 'pending_tls',
      dns_records: '[]',
      last_error: null,
      verified_at: null,
      grace_expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const deleting = {
      ...domain,
      status: 'deleting' as const,
      updated_at: new Date().toISOString(),
    };
    const statements: string[] = [];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      result: {
        id: 'cf-host-1',
        hostname: domain.hostname,
        status: 'active',
        ssl: { status: 'active' },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const env = {
      ...configuredEnv(),
      DB: {
        prepare(sql: string) {
          const normalized = sql.replace(/\s+/g, ' ').trim();
          return {
            bind() {
              return this;
            },
            async run() {
              statements.push(normalized);
              return { meta: { changes: 0 } };
            },
            async first<T>() {
              statements.push(normalized);
              return deleting as T;
            },
          } as unknown as D1PreparedStatement;
        },
      } as unknown as D1Database,
    };

    const synced = await syncDomain(env, domain);

    expect(synced.status).toBe('deleting');
    expect(statements.some(sql =>
      sql.includes('provider_hostname_id = ? AND status = ?')
    )).toBe(true);
  });

  it('suspends an expired domain locally before attempting provider cleanup', async () => {
    const statements: string[] = [];
    const domain: CustomDomain = {
      hostname: 'preview.example.com',
      user_id: 'user-1',
      channel: 'preview',
      parent_hostname: null,
      managed_dns: 0,
      provider_hostname_id: 'cf-host-1',
      status: 'active',
      dns_records: '[]',
      last_error: null,
      verified_at: new Date().toISOString(),
      grace_expires_at: new Date(Date.now() - 60_000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const fetchMock = vi.fn().mockImplementation(async () => {
      expect(statements.some(sql => sql.includes("SET status = 'suspended'"))).toBe(true);
      return new Response(JSON.stringify({
        success: false,
        errors: [{ message: 'Provider unavailable' }],
      }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const env = {
      ...configuredEnv(),
      DB: recordingDb(statements, [domain]),
    };

    await maintainCustomDomains(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(statements.some(sql => sql.includes('SET last_error = ?'))).toBe(true);
    expect(statements.some(sql => sql.includes('SET provider_hostname_id = NULL'))).toBe(false);
  });

  it('suspends an expired domain locally without provider bindings', async () => {
    const statements: string[] = [];
    const domain: CustomDomain = {
      hostname: 'preview.example.com',
      user_id: 'user-1',
      channel: 'preview',
      parent_hostname: null,
      managed_dns: 0,
      provider_hostname_id: 'cf-host-1',
      status: 'active',
      dns_records: '[]',
      last_error: null,
      verified_at: new Date().toISOString(),
      grace_expires_at: new Date(Date.now() - 60_000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const env = {
      ...configuredEnv(),
      CLOUDFLARE_API_TOKEN: undefined,
      CLOUDFLARE_ZONE_ID: undefined,
      CUSTOM_DOMAIN_FALLBACK_HOST: undefined,
      DB: recordingDb(statements, [domain]),
    };

    await maintainCustomDomains(env);

    expect(statements.some(sql => sql.includes("SET status = 'suspended'"))).toBe(true);
    expect(statements.some(sql => sql.includes("'Custom domain provider is not configured'"))).toBe(true);
    expect(statements.some(sql => sql.includes('SET provider_hostname_id = NULL'))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries provider cleanup independently for already-suspended domains', async () => {
    const statements: string[] = [];
    const domain: CustomDomain = {
      hostname: 'preview.example.com',
      user_id: 'user-1',
      channel: 'preview',
      parent_hostname: null,
      managed_dns: 0,
      provider_hostname_id: 'cf-host-1',
      status: 'suspended',
      dns_records: '[]',
      last_error: 'Provider unavailable',
      verified_at: new Date().toISOString(),
      grace_expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      result: {},
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const env = {
      ...configuredEnv(),
      DB: recordingDb(statements, [domain]),
    };

    await maintainCustomDomains(env);

    expect(statements[0]).toContain("status = 'suspended' AND provider_hostname_id IS NOT NULL");
    expect(statements.some(sql =>
      sql.includes("SET provider_hostname_id = NULL, status = 'suspended'") &&
      sql.includes('last_error = NULL')
    )).toBe(true);
  });

  it('keeps a fresh provider-less deletion tombstone while provisioning can finish', async () => {
    const statements: string[] = [];
    const domain: CustomDomain = {
      hostname: 'preview.example.com',
      user_id: 'user-1',
      channel: 'preview',
      parent_hostname: null,
      managed_dns: 0,
      provider_hostname_id: null,
      status: 'deleting',
      dns_records: '[]',
      last_error: null,
      verified_at: null,
      grace_expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await maintainCustomDomains({
      ...configuredEnv(),
      DB: recordingDb(statements, [domain]),
    });

    expect(statements.some(sql => sql.startsWith('DELETE FROM custom_domains'))).toBe(false);
  });

  it('looks up and removes an orphan before deleting an expired provider-less tombstone', async () => {
    const statements: string[] = [];
    const domain: CustomDomain = {
      hostname: 'preview.example.com',
      user_id: 'user-1',
      channel: 'preview',
      parent_hostname: null,
      managed_dns: 0,
      provider_hostname_id: null,
      status: 'deleting',
      dns_records: '[]',
      last_error: 'Cloudflare accepted the hostname but did not return an identifier',
      verified_at: null,
      grace_expires_at: null,
      created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
      updated_at: new Date(Date.now() - 11 * 60_000).toISOString(),
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        result: [{
          id: 'cf-orphan-expired',
          hostname: domain.hostname,
          status: 'pending',
          ssl: { status: 'pending_validation' },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        result: {},
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await maintainCustomDomains({
      ...configuredEnv(),
      DB: recordingDb(statements, [domain]),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
    expect(statements.some(sql => sql.startsWith('DELETE FROM custom_domains'))).toBe(true);
  });
});

function recordingDb(statements: string[], domains: CustomDomain[]): D1Database {
  return {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      return {
        bind() {
          return this;
        },
        async run() {
          statements.push(normalized);
          return {} as D1Result;
        },
        async all<T>() {
          statements.push(normalized);
          return { results: domains as T[] };
        },
      } as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

function configuredEnv(): Env {
  return {
    DB: {} as D1Database,
    BUCKET: {} as R2Bucket,
    BASE_URL: 'https://vanish.sh',
    SELF_HOSTED: 'false',
    DEFAULT_TIER: 'free',
    CLOUDFLARE_API_TOKEN: 'cf-token',
    CLOUDFLARE_ZONE_ID: 'zone-1',
    CUSTOM_DOMAIN_FALLBACK_HOST: 'fallback.vanish.sh',
  };
}
