import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({
  stdin: { value: 'client-secret\n' },
  loadConfig: vi.fn(),
  copyToClipboard: vi.fn(),
  client: {
    me: vi.fn(),
    createSite: vi.fn(),
    createSiteReplacement: vi.fn(),
    uploadSiteFile: vi.fn(),
    publishSite: vi.fn(),
    publishSiteReplacement: vi.fn(),
    patchSite: vi.fn(),
    deleteSite: vi.fn(),
    getSiteChannel: vi.fn(),
    setSiteAccess: vi.fn(),
    listDomains: vi.fn(),
    createDomain: vi.fn(),
    attachDomain: vi.fn(),
    deleteDomain: vi.fn(),
  },
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: (path: Parameters<typeof actual.readFileSync>[0], ...args: unknown[]) =>
      path === 0
        ? mocks.stdin.value
        : (actual.readFileSync as (...values: unknown[]) => unknown)(path, ...args),
  };
});

vi.mock('../src/lib/config.js', () => ({
  loadConfig: mocks.loadConfig,
}));

vi.mock('../src/lib/clipboard.js', () => ({
  copyToClipboard: mocks.copyToClipboard,
}));

vi.mock('../src/lib/api-client.js', () => ({
  VanishClient: vi.fn(function () {
    return mocks.client;
  }),
}));

const { siteCommand } = await import('../src/commands/site.js');

describe('siteCommand', () => {
  let dir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vanish-site-test-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<h1>ok</h1>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'window.ok = true;');

    mocks.loadConfig.mockReset();
    mocks.copyToClipboard.mockReset();
    for (const fn of Object.values(mocks.client)) {
      fn.mockReset();
    }

    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test' });
    mocks.copyToClipboard.mockReturnValue(false);
    mocks.client.createSite.mockResolvedValue({
      id: 'site123',
      token: 'vnst_token',
      url: 'https://site123.vanish.sh/',
      name: 'demo',
      rootPath: 'index.html',
      slug: null,
      fileCount: 2,
      maxFiles: 100,
      maxBytes: 10 * 1024 * 1024,
      expires: '2026-05-11T00:00:00.000Z',
    });
    mocks.client.createSiteReplacement.mockResolvedValue({
      id: 'draft456',
      token: 'vnst_update',
      targetId: 'site123',
      rootPath: 'index.html',
      fileCount: 2,
      maxFiles: 500,
      maxBytes: 50 * 1024 * 1024,
      expires: '2026-05-11T00:00:00.000Z',
    });
    mocks.client.uploadSiteFile.mockResolvedValue(undefined);
    mocks.client.publishSite.mockResolvedValue({
      ok: true,
      id: 'site123',
      url: 'https://site123.vanish.sh/',
      rootPath: 'index.html',
      size: 28,
      fileCount: 2,
      expires: '2026-05-11T00:00:00.000Z',
    });
    mocks.client.publishSiteReplacement.mockResolvedValue({
      ok: true,
      id: 'site123',
      url: 'https://quiet-river-42.vanish.sh/',
      rootPath: 'index.html',
      size: 28,
      fileCount: 2,
      expires: '2026-05-11T00:00:00.000Z',
    });
    mocks.client.deleteSite.mockResolvedValue(undefined);
    mocks.client.getSiteChannel.mockResolvedValue(null);
    mocks.client.listDomains.mockResolvedValue({ domains: [], limit: 1 });
    mocks.client.createDomain.mockResolvedValue({
      hostname: 'preview.example.com',
      channel: 'client-preview',
      status: 'pending_dns',
      dnsRecords: [{ type: 'CNAME', name: 'preview.example.com', value: 'fallback.vanish.sh' }],
      url: 'https://preview.example.com/',
    });
    mocks.client.deleteDomain.mockResolvedValue({ ok: true });

    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`exit ${code}`);
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates, uploads, publishes, and prints JSON', async () => {
    await siteCommand(dir, { root: 'index.html', json: true, clipboard: false });

    expect(mocks.client.createSite).toHaveBeenCalledWith(expect.objectContaining({
      rootPath: 'index.html',
      fileCount: 2,
      totalBytes: expect.any(Number),
    }));
    expect(mocks.client.uploadSiteFile).toHaveBeenCalledTimes(2);
    expect(mocks.client.publishSite).toHaveBeenCalledWith('site123', 'vnst_token', { access: undefined });
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      url: 'https://site123.vanish.sh/',
      id: 'site123',
      rootPath: 'index.html',
      fileCount: 2,
    });
  });

  it('prints a dry-run manifest with blocked files without creating a draft', async () => {
    writeFileSync(join(dir, 'deploy.sh'), 'echo bad');

    await siteCommand(dir, { root: 'index.html', dryRun: true, json: true, clipboard: false });

    expect(mocks.client.createSite).not.toHaveBeenCalled();
    const result = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(result).toMatchObject({
      ok: false,
      dryRun: true,
      rootPath: 'index.html',
      fileCount: 2,
      blockedFiles: [{ path: 'deploy.sh', extension: '.sh' }],
    });
    expect(result.errors[0]).toContain('deploy.sh');
  });

  it('rejects missing root files before creating a draft', async () => {
    await expect(siteCommand(dir, { root: 'missing.html' })).rejects.toThrow('exit 1');

    expect(mocks.client.createSite).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Root file not found'));
  });

  it('rejects blocked extensions before creating a draft', async () => {
    writeFileSync(join(dir, 'deploy.sh'), 'echo bad');

    await expect(siteCommand(dir, { root: 'index.html' })).rejects.toThrow('exit 1');

    expect(mocks.client.createSite).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('File type .sh is not allowed'));
  });

  it('best-effort deletes a draft when publish fails', async () => {
    mocks.client.publishSite.mockRejectedValue(new Error('publish failed'));

    await expect(siteCommand(dir, { root: 'index.html' })).rejects.toThrow('exit 1');

    expect(mocks.client.deleteSite).toHaveBeenCalledWith('site123', 'vnst_token');
    expect(errorSpy).toHaveBeenCalledWith('publish failed');
  });

  it('falls back to anonymous preflight when a stale key is present and no pro option is used', async () => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_stale' });
    mocks.client.me.mockRejectedValue(new Error('Authentication required'));

    await siteCommand(dir, { root: 'index.html', json: true, clipboard: false });

    expect(mocks.client.createSite).toHaveBeenCalled();
  });

  it('updates an existing site by uploading a replacement draft', async () => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.client.me.mockResolvedValue({
      id: 'user1',
      username: 'stan',
      email: null,
      tier: 'free',
      created_at: '2026-05-10T00:00:00.000Z',
      stats: { total_uploads: 0, total_sites: 1, total_bytes: 40 },
      limits: {
        maxFileSize: 50 * 1024 * 1024,
        maxSiteSize: 50 * 1024 * 1024,
        maxSiteFiles: 500,
        maxTotalStorage: 50 * 1024 * 1024,
        maxExpiryHours: 48,
        imageOnly: false,
        customTtl: false,
        rateLimit: 50,
      },
    });

    await siteCommand(dir, { root: 'index.html', update: 'site123', json: true, clipboard: false });

    expect(mocks.client.createSiteReplacement).toHaveBeenCalledWith('site123', expect.objectContaining({
      rootPath: 'index.html',
      fileCount: 2,
      totalBytes: expect.any(Number),
    }));
    expect(mocks.client.uploadSiteFile).toHaveBeenCalledTimes(2);
    expect(mocks.client.publishSiteReplacement).toHaveBeenCalledWith('site123', 'draft456', 'vnst_update', {
      slug: undefined,
      days: undefined,
      access: undefined,
    });
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      url: 'https://quiet-river-42.vanish.sh/',
      id: 'site123',
      rootPath: 'index.html',
      fileCount: 2,
    });
  });

  it('publishes a Pro channel and provisions its custom domain', async () => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.client.me.mockResolvedValue({
      id: 'user1',
      username: 'stan',
      email: null,
      tier: 'pro',
      created_at: '2026-05-10T00:00:00.000Z',
      stats: { total_uploads: 0, total_sites: 0, total_bytes: 0 },
      limits: {
        maxFileSize: 1024 * 1024 * 1024,
        maxSiteSize: 10 * 1024 * 1024 * 1024,
        maxSiteFiles: 5000,
        maxTotalStorage: 10 * 1024 * 1024 * 1024,
        maxExpiryHours: 720,
        imageOnly: false,
        customTtl: true,
        rateLimit: 500,
      },
    });

    await siteCommand(dir, {
      root: 'index.html',
      channel: 'client-preview',
      domain: 'preview.example.com',
      json: true,
      clipboard: false,
    });

    expect(mocks.client.createSite).toHaveBeenCalledWith(expect.objectContaining({ channel: 'client-preview' }));
    expect(mocks.client.createDomain).toHaveBeenCalledWith('preview.example.com', 'client-preview');
    expect(mocks.client.createDomain.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.client.publishSite.mock.invocationCallOrder[0]);
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      canonicalUrl: 'https://site123.vanish.sh/',
      domain: {
        hostname: 'preview.example.com',
        status: 'pending_dns',
      },
    });
  });

  it('rolls back a preflighted domain when publication later fails', async () => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.client.me.mockResolvedValue({
      id: 'user1',
      username: 'stan',
      email: null,
      tier: 'pro',
      created_at: '2026-05-10T00:00:00.000Z',
      stats: { total_uploads: 0, total_sites: 0, total_bytes: 0 },
      limits: {
        maxFileSize: 1024 * 1024 * 1024,
        maxSiteSize: 10 * 1024 * 1024 * 1024,
        maxSiteFiles: 5000,
        maxTotalStorage: 10 * 1024 * 1024 * 1024,
        maxExpiryHours: 720,
        imageOnly: false,
        customTtl: true,
        rateLimit: 500,
      },
    });
    mocks.client.publishSite.mockRejectedValue(new Error('publish failed'));

    await expect(siteCommand(dir, {
      root: 'index.html',
      channel: 'client-preview',
      domain: 'preview.example.com',
      clipboard: false,
    })).rejects.toThrow('exit 1');

    expect(mocks.client.createDomain.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.client.publishSite.mock.invocationCallOrder[0]);
    expect(mocks.client.deleteDomain).toHaveBeenCalledWith('preview.example.com');
    expect(mocks.client.deleteSite).toHaveBeenCalledWith('site123', 'vnst_token');
  });

  it('does not move an existing live domain until publication succeeds', async () => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.client.me.mockResolvedValue({
      id: 'user1',
      username: 'stan',
      email: null,
      tier: 'pro',
      created_at: '2026-05-10T00:00:00.000Z',
      stats: { total_uploads: 0, total_sites: 0, total_bytes: 0 },
      limits: {
        maxFileSize: 1024 * 1024 * 1024,
        maxSiteSize: 10 * 1024 * 1024 * 1024,
        maxSiteFiles: 5000,
        maxTotalStorage: 10 * 1024 * 1024 * 1024,
        maxExpiryHours: 720,
        imageOnly: false,
        customTtl: true,
        rateLimit: 500,
      },
    });
    const existingDomain = {
      hostname: 'preview.example.com',
      channel: 'production',
      status: 'active',
      dnsRecords: [],
      lastError: null,
      verifiedAt: '2026-05-10T00:00:00.000Z',
      graceExpiresAt: null,
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
      url: 'https://preview.example.com/',
    };
    mocks.client.listDomains.mockResolvedValue({ domains: [existingDomain], limit: 1 });
    mocks.client.publishSite.mockRejectedValue(new Error('publish failed'));

    await expect(siteCommand(dir, {
      root: 'index.html',
      channel: 'client-preview',
      domain: 'preview.example.com',
      clipboard: false,
    })).rejects.toThrow('exit 1');

    expect(mocks.client.attachDomain).not.toHaveBeenCalled();
    expect(mocks.client.deleteDomain).not.toHaveBeenCalled();
    expect(mocks.client.deleteSite).toHaveBeenCalledWith('site123', 'vnst_token');
  });

  it('keeps a successful publish usable when an existing domain reattachment fails', async () => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.client.me.mockResolvedValue({
      id: 'user1',
      username: 'stan',
      email: null,
      tier: 'pro',
      created_at: '2026-05-10T00:00:00.000Z',
      stats: { total_uploads: 0, total_sites: 0, total_bytes: 0 },
      limits: {
        maxFileSize: 1024 * 1024 * 1024,
        maxSiteSize: 10 * 1024 * 1024 * 1024,
        maxSiteFiles: 5000,
        maxTotalStorage: 10 * 1024 * 1024 * 1024,
        maxExpiryHours: 720,
        imageOnly: false,
        customTtl: true,
        rateLimit: 500,
      },
    });
    mocks.client.listDomains.mockResolvedValue({
      domains: [{
        hostname: 'preview.example.com',
        channel: 'production',
        status: 'active',
        dnsRecords: [],
        lastError: null,
        verifiedAt: '2026-05-10T00:00:00.000Z',
        graceExpiresAt: null,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
        url: 'https://preview.example.com/',
      }],
      limit: 1,
    });
    mocks.client.attachDomain.mockRejectedValue(new Error('provider unavailable'));

    await siteCommand(dir, {
      root: 'index.html',
      channel: 'client-preview',
      domain: 'preview.example.com',
      json: true,
      clipboard: false,
    });

    expect(mocks.client.publishSite.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.client.attachDomain.mock.invocationCallOrder[0]);
    expect(mocks.client.attachDomain).toHaveBeenCalledWith('preview.example.com', 'client-preview');
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      url: 'https://site123.vanish.sh/',
      canonicalUrl: 'https://site123.vanish.sh/',
      domainError: 'provider unavailable',
    });
  });

  it('verifies the final active custom-domain URL', async () => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.client.me.mockResolvedValue({
      id: 'user1',
      username: 'stan',
      email: null,
      tier: 'pro',
      created_at: '2026-05-10T00:00:00.000Z',
      stats: { total_uploads: 0, total_sites: 0, total_bytes: 0 },
      limits: {
        maxFileSize: 1024 * 1024 * 1024,
        maxSiteSize: 10 * 1024 * 1024 * 1024,
        maxSiteFiles: 5000,
        maxTotalStorage: 10 * 1024 * 1024 * 1024,
        maxExpiryHours: 720,
        imageOnly: false,
        customTtl: true,
        rateLimit: 500,
      },
    });
    mocks.client.listDomains.mockResolvedValue({
      domains: [{
        hostname: 'preview.example.com',
        channel: 'client-preview',
        status: 'active',
        dnsRecords: [],
        lastError: null,
        verifiedAt: '2026-05-10T00:00:00.000Z',
        graceExpiresAt: null,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
        url: 'https://preview.example.com/',
      }],
      limit: 1,
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<script src="assets/app.js"></script>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }))
      .mockResolvedValueOnce(new Response('window.ok = true;', {
        status: 200,
        headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await siteCommand(dir, {
      root: 'index.html',
      channel: 'client-preview',
      domain: 'preview.example.com',
      verify: true,
      json: true,
      clipboard: false,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://preview.example.com/', {
      redirect: 'follow',
      headers: undefined,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://preview.example.com/assets/app.js', {
      redirect: 'follow',
      headers: undefined,
    });
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      url: 'https://preview.example.com/',
      verified: true,
    });
  });

  it('publishes password protection atomically instead of patching after publication', async () => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.client.me.mockResolvedValue({
      id: 'user1',
      username: 'stan',
      email: null,
      tier: 'free',
      created_at: '2026-05-10T00:00:00.000Z',
      stats: { total_uploads: 0, total_sites: 0, total_bytes: 0 },
      limits: {
        maxFileSize: 50 * 1024 * 1024,
        maxSiteSize: 50 * 1024 * 1024,
        maxSiteFiles: 500,
        maxTotalStorage: 50 * 1024 * 1024,
        maxExpiryHours: 48,
        imageOnly: false,
        customTtl: false,
        rateLimit: 50,
      },
    });
    mocks.client.publishSite.mockResolvedValue({
      ok: true,
      id: 'site123',
      url: 'https://site123.vanish.sh/',
      rootPath: 'index.html',
      size: 28,
      fileCount: 2,
      expires: '2026-05-11T00:00:00.000Z',
      access: {
        siteId: 'site123',
        mode: 'password',
        policyVersion: 1,
        passwordConfigured: true,
      },
    });

    await siteCommand(dir, {
      root: 'index.html',
      passwordStdin: true,
      json: true,
      clipboard: false,
    });

    expect(mocks.client.publishSite).toHaveBeenCalledWith('site123', 'vnst_token', {
      access: { mode: 'password', password: 'client-secret' },
    });
    expect(mocks.client.setSiteAccess).not.toHaveBeenCalled();
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      access: { mode: 'password', passwordConfigured: true },
    });
  });

  it('unlocks a protected publication before verifying its content', async () => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.client.me.mockResolvedValue({
      id: 'user1',
      username: 'stan',
      email: null,
      tier: 'free',
      created_at: '2026-05-10T00:00:00.000Z',
      stats: { total_uploads: 0, total_sites: 0, total_bytes: 0 },
      limits: {
        maxFileSize: 50 * 1024 * 1024,
        maxSiteSize: 50 * 1024 * 1024,
        maxSiteFiles: 500,
        maxTotalStorage: 50 * 1024 * 1024,
        maxExpiryHours: 48,
        imageOnly: false,
        customTtl: false,
        rateLimit: 50,
      },
    });
    mocks.client.publishSite.mockResolvedValue({
      ok: true,
      id: 'site123',
      url: 'https://site123.vanish.sh/',
      rootPath: 'index.html',
      size: 28,
      fileCount: 2,
      expires: '2026-05-11T00:00:00.000Z',
      access: {
        siteId: 'site123',
        mode: 'password',
        policyVersion: 1,
        passwordConfigured: true,
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"ok":true}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'vnsh_access_site123=session-token; Path=/; HttpOnly',
        },
      }))
      .mockResolvedValueOnce(new Response('<h1>ok</h1><script src="assets/app.js"></script>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }))
      .mockResolvedValueOnce(new Response('window.ok = true;', {
        status: 200,
        headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await siteCommand(dir, {
      root: 'index.html',
      passwordStdin: true,
      verify: true,
      json: true,
      clipboard: false,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, new URL('https://site123.vanish.sh/.vanish/access'), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ site: 'site123', password: 'client-secret', return: '/' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://site123.vanish.sh/', {
      redirect: 'follow',
      headers: { Cookie: 'vnsh_access_site123=session-token' },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://site123.vanish.sh/assets/app.js', {
      redirect: 'follow',
      headers: { Cookie: 'vnsh_access_site123=session-token' },
    });
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      verified: true,
      verification: { verified: true },
    });
  });

  it('prints update and delete commands after authenticated publish success', async () => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.client.me.mockResolvedValue({
      id: 'user1',
      username: 'stan',
      email: null,
      tier: 'free',
      created_at: '2026-05-10T00:00:00.000Z',
      stats: { total_uploads: 0, total_sites: 0, total_bytes: 0 },
      limits: {
        maxFileSize: 50 * 1024 * 1024,
        maxSiteSize: 50 * 1024 * 1024,
        maxSiteFiles: 500,
        maxTotalStorage: 50 * 1024 * 1024,
        maxExpiryHours: 48,
        imageOnly: false,
        customTtl: false,
        rateLimit: 50,
      },
    });

    await siteCommand(dir, { root: 'index.html', clipboard: false });

    expect(logSpy).toHaveBeenCalledWith('https://site123.vanish.sh/');
    const stderr = stderrSpy.mock.calls.map(call => String(call[0])).join('');
    expect(stderr).toContain('Expires in');
    expect(stderr).toContain(`Update this URL: vanish site ${dir} --root index.html --update site123`);
    expect(stderr).toContain('Delete this site: curl -X DELETE -H "Authorization: Bearer $VANISH_API_KEY" https://vanish.test/sites/site123');
  });

  it('requires login for site updates', async () => {
    await expect(siteCommand(dir, { root: 'index.html', update: 'site123' })).rejects.toThrow('exit 1');

    expect(mocks.client.createSiteReplacement).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('Error: --update requires login. Use: vanish login');
  });
});
