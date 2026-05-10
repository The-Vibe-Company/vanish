import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({
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
  },
}));

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

    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
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

  it('creates, uploads, publishes, and prints JSON', async () => {
    await siteCommand(dir, { root: 'index.html', json: true, clipboard: false });

    expect(mocks.client.createSite).toHaveBeenCalledWith(expect.objectContaining({
      rootPath: 'index.html',
      fileCount: 2,
      totalBytes: expect.any(Number),
    }));
    expect(mocks.client.uploadSiteFile).toHaveBeenCalledTimes(2);
    expect(mocks.client.publishSite).toHaveBeenCalledWith('site123', 'vnst_token');
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      url: 'https://site123.vanish.sh/',
      id: 'site123',
      rootPath: 'index.html',
      fileCount: 2,
    });
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
    });
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      url: 'https://quiet-river-42.vanish.sh/',
      id: 'site123',
      rootPath: 'index.html',
      fileCount: 2,
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
