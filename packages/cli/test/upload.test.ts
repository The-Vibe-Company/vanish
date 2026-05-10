import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  copyToClipboard: vi.fn(),
  client: {
    upload: vi.fn(),
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

const { uploadCommand } = await import('../src/commands/upload.js');

describe('uploadCommand', () => {
  let dir: string;
  let file: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vanish-upload-test-'));
    file = join(dir, 'image.png');
    writeFileSync(file, 'png');

    mocks.loadConfig.mockReset();
    mocks.copyToClipboard.mockReset();
    mocks.client.upload.mockReset();

    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test', api_key: 'vnsh_key' });
    mocks.copyToClipboard.mockReturnValue(false);
    mocks.client.upload.mockResolvedValue({
      url: 'https://vanish.sh/f/upload123.png',
      id: 'upload123',
      filename: 'image.png',
      size: 3,
      expires: '2026-05-11T00:00:00.000Z',
      tier: 'free',
      deletable: true,
    });

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prints expiry and delete command for authenticated uploads', async () => {
    await uploadCommand([file], { clipboard: false });

    expect(logSpy).toHaveBeenCalledWith('https://vanish.sh/f/upload123.png');
    const stderr = stderrSpy.mock.calls.map(call => String(call[0])).join('');
    expect(stderr).toContain('Expires in');
    expect(stderr).toContain('Delete this file: vanish rm upload123');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('adds non-breaking activation fields to JSON output', async () => {
    await uploadCommand([file], { json: true, clipboard: false });

    const result = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(result).toMatchObject({
      url: 'https://vanish.sh/f/upload123.png',
      id: 'upload123',
      deleteCommand: 'vanish rm upload123',
    });
    expect(result.expiresInHours).toEqual(expect.any(Number));
  });
});
