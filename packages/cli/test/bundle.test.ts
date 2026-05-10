import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  copyToClipboard: vi.fn(),
  client: {
    createBundle: vi.fn(),
    uploadBundleFile: vi.fn(),
    publishBundle: vi.fn(),
    deleteBundle: vi.fn(),
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

const { bundleCommand } = await import('../src/commands/bundle.js');

describe('bundleCommand', () => {
  let dir: string;
  let oldCwd: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    oldCwd = process.cwd();
    dir = mkdtempSync(join(tmpdir(), 'vanish-bundle-test-'));
    mkdirSync(join(dir, 'reports'));
    mkdirSync(join(dir, 'logs'));
    writeFileSync(join(dir, 'reports', 'a.txt'), 'report');
    writeFileSync(join(dir, 'logs', 'a.txt'), 'log');
    process.chdir(dir);

    mocks.loadConfig.mockReset();
    mocks.copyToClipboard.mockReset();
    for (const fn of Object.values(mocks.client)) {
      fn.mockReset();
    }

    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.copyToClipboard.mockReturnValue(false);
    mocks.client.createBundle.mockResolvedValue({
      id: 'bundle123',
      token: 'vnbd_token',
      url: 'https://vanish.test/b/bundle123',
      name: 'bundle',
      fileCount: 2,
      maxFiles: 500,
      maxBytes: 50 * 1024 * 1024,
      expires: '2026-05-11T00:00:00.000Z',
    });
    mocks.client.uploadBundleFile.mockResolvedValue(undefined);
    mocks.client.publishBundle.mockResolvedValue({
      ok: true,
      id: 'bundle123',
      url: 'https://vanish.test/b/bundle123',
      size: 9,
      fileCount: 2,
      expires: '2026-05-11T00:00:00.000Z',
    });
    mocks.client.deleteBundle.mockResolvedValue(undefined);

    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`exit ${code}`);
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.chdir(oldCwd);
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('preserves relative paths to avoid basename collisions', async () => {
    await bundleCommand(['reports/a.txt', 'logs/a.txt'], { json: true, clipboard: false });

    expect(mocks.client.uploadBundleFile).toHaveBeenCalledWith('bundle123', 'vnbd_token', expect.any(String), 'reports/a.txt');
    expect(mocks.client.uploadBundleFile).toHaveBeenCalledWith('bundle123', 'vnbd_token', expect.any(String), 'logs/a.txt');
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      url: 'https://vanish.test/b/bundle123',
      id: 'bundle123',
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('rejects duplicate bundle paths before creating a draft', async () => {
    await expect(bundleCommand([
      join(dir, 'reports', 'a.txt'),
      join(dir, 'logs', 'a.txt'),
    ], { json: true, clipboard: false })).rejects.toThrow('exit 1');

    expect(mocks.client.createBundle).not.toHaveBeenCalled();
    const result = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(result).toMatchObject({
      ok: false,
      code: 'duplicate_bundle_path',
    });
  });
});
