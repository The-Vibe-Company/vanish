import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  client: {
    getSiteFiles: vi.fn(),
  },
}));

vi.mock('../src/lib/config.js', () => ({
  loadConfig: mocks.loadConfig,
}));

vi.mock('../src/lib/api-client.js', () => ({
  VanishClient: vi.fn(function () {
    return mocks.client;
  }),
}));

const { siteVerifyCommand } = await import('../src/commands/sites.js');

describe('siteVerifyCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.loadConfig.mockReset();
    mocks.client.getSiteFiles.mockReset();
    mocks.loadConfig.mockReturnValue({
      api_url: 'https://vanish.test',
      api_key: 'vnsh_key',
    });
    mocks.client.getSiteFiles.mockResolvedValue({
      site: {
        id: 'site123',
        url: 'https://site123.vanish.sh/',
        root_path: 'index.html',
      },
      files: [{ path: 'index.html' }],
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not report a password gate as verified content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<form></form>', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Vanish-Access': 'password-required',
      },
    })));

    await siteVerifyCommand('site123', { json: true });

    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      verified: false,
      checks: [{
        name: 'root',
        ok: false,
        message: 'Password required; rerun with --password-stdin',
      }],
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does not report a gated asset as verified content', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<script src="app.js"></script>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }))
      .mockResolvedValueOnce(new Response('<form></form>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Vanish-Access': 'password-required',
        },
      }));
    vi.stubGlobal('fetch', fetchMock);
    mocks.client.getSiteFiles.mockResolvedValue({
      site: {
        id: 'site123',
        url: 'https://site123.vanish.sh/',
        root_path: 'index.html',
      },
      files: [{ path: 'index.html' }, { path: 'app.js' }],
    });

    await siteVerifyCommand('site123', { json: true });

    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      verified: false,
      checks: expect.arrayContaining([{
        name: 'asset:app.js',
        ok: false,
        message: 'app.js returned a password gate instead of uploaded content',
      }]),
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
