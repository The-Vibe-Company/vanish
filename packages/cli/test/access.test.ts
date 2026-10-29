import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  copyToClipboard: vi.fn(),
  stdin: { value: 'client-secret\n' },
  client: {
    me: vi.fn(),
    upload: vi.fn(),
    createSite: vi.fn(),
    uploadSiteFile: vi.fn(),
    publishSite: vi.fn(),
    deleteSite: vi.fn(),
    getSiteChannel: vi.fn(),
    setSiteAccess: vi.fn(),
    setFileAccess: vi.fn(),
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
vi.mock('../src/lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('../src/lib/clipboard.js', () => ({ copyToClipboard: mocks.copyToClipboard }));
vi.mock('../src/lib/api-client.js', () => ({
  VanishClient: vi.fn(function () {
    return mocks.client;
  }),
}));

const { siteCommand } = await import('../src/commands/site.js');
const { uploadCommand } = await import('../src/commands/upload.js');
const { fileAccessCommand, siteAccessCommand } = await import('../src/commands/sites.js');
const { parseFileTarget } = await import('../src/lib/access-options.js');

describe('access options', () => {
  let dir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vanish-access-test-'));
    writeFileSync(join(dir, 'index.html'), '<h1>ok</h1>');
    writeFileSync(join(dir, 'report.pdf'), '%PDF');

    for (const fn of [mocks.loadConfig, mocks.copyToClipboard, ...Object.values(mocks.client)]) fn.mockReset();
    mocks.stdin.value = 'client-secret\n';
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.copyToClipboard.mockReturnValue(false);
    mocks.client.me.mockResolvedValue({
      tier: 'pro',
      stats: { total_bytes: 0 },
      limits: { maxFileSize: 1e9, maxSiteSize: 1e9, maxSiteFiles: 1000, maxTotalStorage: 1e9 },
    });
    mocks.client.getSiteChannel.mockResolvedValue(null);
    mocks.client.createSite.mockResolvedValue({ id: 'site1', token: 'vnst_t', url: 'https://calm-river.vanish.sh/', rootPath: 'index.html' });
    mocks.client.uploadSiteFile.mockResolvedValue(undefined);
    mocks.client.publishSite.mockResolvedValue({
      ok: true, id: 'site1', url: 'https://calm-river.vanish.sh/', rootPath: 'index.html', size: 11, fileCount: 1,
      expires: null, access: { siteId: 'site1', mode: 'email', policyVersion: 1, passwordConfigured: false, emailCount: 2 },
    });
    mocks.client.upload.mockResolvedValue({
      url: 'https://vanish.sh/f/up1.pdf', id: 'up1', filename: 'report.pdf', size: 4, expires: null, deletable: true,
      access: { uploadId: 'up1', mode: 'password', policyVersion: 1, passwordConfigured: true },
    });

    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`exit ${code}`);
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function stderrText(): string {
    return stderrSpy.mock.calls.map(call => String(call[0])).join('');
  }

  it('publishes an email allowlist atomically with the site', async () => {
    await siteCommand(dir, { root: 'index.html', allowEmail: ['ana@acme.com', 'bo@acme.com'], clipboard: false });

    expect(mocks.client.publishSite).toHaveBeenCalledWith('site1', 'vnst_t', {
      access: { mode: 'email', emails: ['ana@acme.com', 'bo@acme.com'] },
    });
    expect(stderrText()).toContain('Restricted to 2 emails');
  });

  it('refuses conflicting or unauthenticated site protection before uploading', async () => {
    await expect(siteCommand(dir, { root: 'index.html', allowEmail: ['ana@acme.com'], passwordStdin: true })).rejects.toThrow('exit 1');
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test' });
    await expect(siteCommand(dir, { root: 'index.html', allowEmail: ['ana@acme.com'] })).rejects.toThrow('exit 1');
    expect(mocks.client.createSite).not.toHaveBeenCalled();
  });

  it('protects an upload with a password read from stdin', async () => {
    await uploadCommand([join(dir, 'report.pdf')], { passwordStdin: true, json: true, clipboard: false });

    expect(mocks.client.upload.mock.calls[0][1]).toMatchObject({ access: { mode: 'password', password: 'client-secret' } });
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({ access: { mode: 'password' } });
  });

  it('restricts an upload to emails', async () => {
    await uploadCommand([join(dir, 'report.pdf')], { allowEmail: ['ana@acme.com'], clipboard: false });
    expect(mocks.client.upload.mock.calls[0][1]).toMatchObject({ access: { mode: 'email', emails: ['ana@acme.com'] } });
  });

  it('refuses upload protection without login', async () => {
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test' });
    await expect(uploadCommand([join(dir, 'report.pdf')], { passwordStdin: true })).rejects.toThrow('exit 1');
    expect(mocks.client.upload).not.toHaveBeenCalled();
  });

  it('changes site and file access to an email allowlist', async () => {
    mocks.client.setSiteAccess.mockResolvedValue({ siteId: 'site1', mode: 'email', policyVersion: 2, passwordConfigured: false, emailCount: 1 });
    await siteAccessCommand('calm-river', { mode: 'email', allowEmail: ['ana@acme.com'] });
    expect(mocks.client.setSiteAccess).toHaveBeenCalledWith('calm-river', { mode: 'email', emails: ['ana@acme.com'] });

    mocks.client.setFileAccess.mockResolvedValue({ uploadId: 'up1', mode: 'link', policyVersion: 3, passwordConfigured: false });
    await fileAccessCommand('https://vanish.sh/f/up1.pdf', { mode: 'link' });
    expect(mocks.client.setFileAccess).toHaveBeenCalledWith('up1', { mode: 'link' });
    expect(logSpy).toHaveBeenCalledWith('Anyone with the link can open it.');
  });

  it('requires an email for email mode', async () => {
    await expect(fileAccessCommand('up1', { mode: 'email' })).rejects.toThrow('exit 1');
    expect(mocks.client.setFileAccess).not.toHaveBeenCalled();
  });

  it('parses file targets', () => {
    expect(parseFileTarget('up1')).toBe('up1');
    expect(parseFileTarget('up1.pdf')).toBe('up1');
    expect(parseFileTarget('https://vanish.sh/f/up1.pdf')).toBe('up1');
  });
});
