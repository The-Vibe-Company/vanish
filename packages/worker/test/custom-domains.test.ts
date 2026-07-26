import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginDomainGrace,
  createProviderHostname,
  deleteProviderHostname,
  getProviderHostname,
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
