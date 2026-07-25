import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/types.js';

describe('dashboard route', () => {
  it('updates countdowns without rerendering the whole page every second', async () => {
    const html = await fetchDashboardHtml();

    expect(html).toContain('data-countdown-expires');
    expect(html).toContain('function updateVisibleCountdowns()');
    expect(html).not.toMatch(/setInterval\(function\(\) \{[\s\S]*?rerenderMain\(\);\s*\}\s*}, 1000\);/);
  });

  it('offers GitHub connect and existing API key login options', async () => {
    const html = await fetchDashboardHtml();

    expect(html).toContain('href="/auth/github?redirect=/dashboard"');
    expect(html).toContain('Connect with GitHub');
    expect(html).toContain('placeholder="vnsh_..."');
    expect(html).toContain('Use API key');
  });

  it('distinguishes drafts, exposes the 10GB Pro plan, and uses mobile card layouts', async () => {
    const html = await fetchDashboardHtml();

    expect(html).toContain("if (s.draft) return 'draft'");
    expect(html).toContain('cleaned after 6h');
    expect(html).toContain('"pro":10');
    expect(html).not.toContain('"max":10');
    expect(html).toContain('(me.stats.total_site_drafts || 0)');
    expect(html).toContain('(me.stats.published_sites || 0)');
    expect(html).toContain("fmtBytes(me.stats.bundle_bytes || 0)");
    expect(html).toContain(" + ' bundles</div>'");
    expect(html).toContain('s.lastActivity + 6 * 3600 * 1000');
    expect(html).toContain('billing managed in Stripe');
    expect(html).not.toContain("PLAN_PRICES_EUR[me.tier] ? '€'");
    expect(html).toContain('.files-head, .keys-head { display: none; }');
    expect(html).toContain('content: attr(data-label)');
    expect(html).not.toContain('/billing/checkout?key=');
  });

  it('covers the iOS browser chrome above the sticky mobile navigation', async () => {
    const html = await fetchDashboardHtml();
    const mobileCss = html.match(
      /@media \(max-width: 760px\) \{([\s\S]*?)\n\}\n@media \(max-width: 520px\)/
    )?.[1];
    const guardCss = mobileCss?.match(/\.sidebar::before\s*\{([^}]*)\}/)?.[1];

    expect(html).toContain('<meta name="theme-color" content="#1649e8">');
    expect(mobileCss).toBeDefined();
    expect(guardCss).toBeDefined();
    expect(guardCss).toMatch(/position:\s*absolute/);
    expect(guardCss).toMatch(/right:\s*0/);
    expect(guardCss).toMatch(/bottom:\s*100%/);
    expect(guardCss).toMatch(/left:\s*0/);
    expect(guardCss).toMatch(/height:\s*100vh/);
    expect(guardCss).toMatch(/height:\s*100svh/);
    expect(guardCss).toMatch(/background:\s*#1649e8/);
    expect(guardCss).toMatch(/pointer-events:\s*none/);
  });
});

async function fetchDashboardHtml(): Promise<string> {
  const response = await worker.fetch(new Request('https://vanish.sh/dashboard'), {
    DB: { prepare: () => { throw new Error('DB should not be used'); } } as unknown as D1Database,
    BUCKET: {} as R2Bucket,
    BASE_URL: 'https://vanish.sh',
    SELF_HOSTED: 'false',
    DEFAULT_TIER: 'free',
  } as Env, {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext);

  expect(response.status).toBe(200);
  return response.text();
}
