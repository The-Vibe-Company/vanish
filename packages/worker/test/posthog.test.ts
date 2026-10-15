import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { posthogConfig } from '../src/lib/posthog.js';
import type { Env } from '../src/types.js';

const HOSTED_KEY = 'phc_BCpPQFoAM6qMoomUS96dA2otiwkmMPF2VrYqiWdbiHBP';

describe('posthog config', () => {
  it('uses the hosted project key only on vanish.sh', () => {
    expect(posthogConfig(env(), 'https://vanish.sh/')).toEqual({ key: HOSTED_KEY, host: 'https://us.i.posthog.com' });
    expect(posthogConfig(env(), 'http://localhost:8787/')).toBeNull();
    expect(posthogConfig(env(), 'https://abc123.vanish.sh/')).toBeNull();
    expect(posthogConfig(env({ SELF_HOSTED: 'true' }), 'https://vanish.sh/')).toBeNull();
  });

  it('prefers explicit POSTHOG_KEY and POSTHOG_HOST', () => {
    expect(posthogConfig(env({ POSTHOG_KEY: 'phc_local', POSTHOG_HOST: 'https://eu.i.posthog.com/' }), 'http://localhost:8787/'))
      .toEqual({ key: 'phc_local', host: 'https://eu.i.posthog.com' });
  });
});

describe('posthog page integration', () => {
  it('loads PostHog with history-change pageviews on the production landing page', async () => {
    const html = await page('https://vanish.sh/');

    expect(html).toContain('/static/array.js');
    expect(html).toContain(`posthog.init("${HOSTED_KEY}", {"api_host":"https://us.i.posthog.com"`);
    expect(html).toContain('"capture_pageview":"history_change"');
  });

  it('does not load PostHog in local dev without an explicit key', async () => {
    const html = await page('http://localhost:8787/', { BASE_URL: 'http://localhost:8787' });
    expect(html).not.toContain('posthog');

    const dashboard = await page('http://localhost:8787/dashboard', { BASE_URL: 'http://localhost:8787' });
    expect(dashboard).not.toContain('posthog.init');
  });

  it('initializes dashboard analytics only after scrubbing the API key from the URL', async () => {
    const html = await page('https://vanish.sh/dashboard');
    const scrub = html.indexOf("history.replaceState({}, '', '/dashboard');");
    const init = html.indexOf('posthog.init(');

    expect(scrub).toBeGreaterThan(-1);
    expect(init).toBeGreaterThan(scrub);
    expect(html).toContain('window.posthog.identify(state.me.id, { email: state.me.email || undefined, name: state.me.username || undefined });');
    expect(html).toContain('if (window.posthog) window.posthog.reset();');
    expect(html).toContain('<div class="key-reveal ph-no-capture">');
  });
});

function env(overrides: Partial<Env> = {}): Env {
  return {
    DB: { prepare: () => { throw new Error('DB should not be used'); } } as unknown as D1Database,
    BUCKET: {} as R2Bucket,
    BASE_URL: 'https://vanish.sh',
    SELF_HOSTED: 'false',
    DEFAULT_TIER: 'free',
    ...overrides,
  };
}

async function page(url: string, overrides: Partial<Env> = {}): Promise<string> {
  const response = await worker.fetch(new Request(url), env(overrides), {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext);
  expect(response.status).toBe(200);
  return response.text();
}
