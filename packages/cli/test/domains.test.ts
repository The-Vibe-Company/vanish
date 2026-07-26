import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  client: {
    createDomain: vi.fn(),
    listDomains: vi.fn(),
    verifyDomain: vi.fn(),
    attachDomain: vi.fn(),
    deleteDomain: vi.fn(),
  },
}));

vi.mock('../src/lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('../src/lib/api-client.js', () => ({
  VanishClient: vi.fn(function () {
    return mocks.client;
  }),
}));

const {
  domainAddCommand,
  domainsListCommand,
  domainVerifyCommand,
} = await import('../src/commands/domains.js');

describe('domain commands', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_test' });
    for (const fn of Object.values(mocks.client)) fn.mockReset();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a domain and prints actionable DNS records', async () => {
    mocks.client.createDomain.mockResolvedValue(domain('pending_dns'));

    await domainAddCommand('preview.example.com', { channel: 'client-preview' });

    expect(mocks.client.createDomain).toHaveBeenCalledWith('preview.example.com', 'client-preview');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('CNAME  preview.example.com -> fallback.vanish.sh');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('vanish domains verify preview.example.com');
  });

  it('lists and verifies domains as stable JSON', async () => {
    mocks.client.listDomains.mockResolvedValue({ domains: [domain('pending_tls')], limit: 1 });
    mocks.client.verifyDomain.mockResolvedValue(domain('active'));

    await domainsListCommand({ json: true });
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      limit: 1,
      domains: [{ hostname: 'preview.example.com', status: 'pending_tls' }],
    });

    logSpy.mockClear();
    await domainVerifyCommand('preview.example.com', { json: true });
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({ status: 'active' });
  });
});

function domain(status: 'pending_dns' | 'pending_tls' | 'active') {
  return {
    hostname: 'preview.example.com',
    channel: 'client-preview',
    status,
    dnsRecords: [{ type: 'CNAME', name: 'preview.example.com', value: 'fallback.vanish.sh' }],
    lastError: null,
    verifiedAt: status === 'active' ? '2026-07-26T00:00:00.000Z' : null,
    graceExpiresAt: null,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    url: 'https://preview.example.com/',
  };
}
