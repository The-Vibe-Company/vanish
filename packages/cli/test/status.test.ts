import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  me: vi.fn(),
}));

vi.mock('../src/lib/config.js', () => ({
  loadConfig: mocks.loadConfig,
}));

vi.mock('../src/lib/api-client.js', () => ({
  VanishClient: vi.fn(function () {
    return { me: mocks.me };
  }),
}));

const { statusCommand } = await import('../src/commands/status.js');

describe('statusCommand', () => {
  beforeEach(() => {
    mocks.loadConfig.mockReturnValue({ api_key: 'vnsh_test', api_url: 'https://vanish.test' });
    mocks.me.mockResolvedValue({
      tier: 'pro',
      stats: {
        total_uploads: 0,
        total_sites: 4,
        published_sites: 3,
        total_site_drafts: 1,
        total_bytes: 0,
      },
      limits: {
        maxFileSize: 1024,
        maxSiteSize: 1024,
        maxSiteFiles: 5000,
        maxTotalStorage: 10 * 1024,
        maxExpiryHours: 720,
        imageOnly: false,
        customTtl: true,
        rateLimit: 500,
      },
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('uses the published-only counter for the published-sites label', async () => {
    await statusCommand({});

    expect(console.log).toHaveBeenCalledWith('Published sites: 3');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Site drafts: 1'));
  });
});
