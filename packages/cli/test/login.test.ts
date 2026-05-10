import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  open: vi.fn(),
}));

vi.mock('../src/lib/config.js', () => ({
  loadConfig: mocks.loadConfig,
  saveConfig: mocks.saveConfig,
}));

vi.mock('open', () => ({
  default: mocks.open,
}));

const { loginCommand } = await import('../src/commands/login.js');

describe('loginCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.loadConfig.mockReset();
    mocks.saveConfig.mockReset();
    mocks.open.mockReset();
    mocks.loadConfig.mockReturnValue({ api_url: 'https://vanish.test' });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://vanish.test/auth/cli/start') {
        return Response.json({
          session: 'session123',
          pollToken: 'poll-secret',
          userCode: 'ABC123',
          loginUrl: 'https://vanish.test/auth/github?session=session123&nonce=nonce',
        }, { status: 201 });
      }
      if (url === 'https://vanish.test/auth/poll?session=session123') {
        expect(init?.headers).toEqual({ 'X-Poll-Token': 'poll-secret' });
        return Response.json({ api_key: 'vnsh_new_key', username: 'stan' });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the secure CLI session, prints the user code, and polls with a header token', async () => {
    const result = loginCommand();
    await vi.advanceTimersByTimeAsync(2000);
    await result;

    expect(mocks.open).toHaveBeenCalledWith('https://vanish.test/auth/github?session=session123&nonce=nonce');
    expect(mocks.saveConfig).toHaveBeenCalledWith({ api_key: 'vnsh_new_key' });
    const output = logSpy.mock.calls.map(call => String(call[0])).join('\n');
    expect(output).toContain('Confirm code: ABC123');
    expect(output).toContain('Logged in as @stan');
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('token=poll-secret'), expect.anything());
  });
});
