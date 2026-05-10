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
    uploadSiteFile: vi.fn(),
    publishSite: vi.fn(),
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
  VanishClient: vi.fn(() => mocks.client),
}));

const { siteCommand } = await import('../src/commands/site.js');

describe('siteCommand', () => {
  let dir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vanish-site-test-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<h1>ok</h1>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'window.ok = true;');

    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test' });
    mocks.copyToClipboard.mockReturnValue(false);
    mocks.client.me.mockReset();
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
    mocks.client.deleteSite.mockResolvedValue(undefined);

    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`exit ${code}`);
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
});
