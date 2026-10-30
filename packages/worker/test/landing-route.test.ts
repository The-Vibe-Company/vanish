import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/types.js';

describe('landing route', () => {
  it('serves activation-focused copy and core links', async () => {
    const response = await worker.fetch(new Request('https://vanish.sh/'), {
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
    const html = await response.text();
    expect(html).toContain('<title>vanish: public preview URLs for agent-made artifacts</title>');
    expect(html).toContain('The publish command your agent was missing.');
    expect(html).toContain('A public URL for anything your agent makes. It expires on its own.');
    expect(html).toContain('A photo, an image, a text, a file, a whole website');
    expect(html).toContain('npx vanish-cli upload photo.jpg');
    expect(html).toContain('No account needed to try.');
    expect(html).toContain('npx vanish-cli site ./demo --root index.html');
    expect(html).toContain('Plans and limits');
    expect(html).toContain('Is it public?');
    expect(html).toContain('Who can open it');
    expect(html).not.toContain('There is no password');
    expect(html).toContain('300 MB · 100 files');
    expect(html).toContain('5,000 files · within 10 GB');
    expect(html).toContain('10 €');
    expect(html).toContain('posthog');
    expect(html).toContain('href="/auth/github?redirect=/dashboard"');
    expect(html).not.toContain('href="/auth/github">');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('<meta property="og:image" content="https://vanish.sh/og.png" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('mailto:abuse@vanish.sh');
  });

  it('serves the share image as a 1200 x 630 PNG', async () => {
    const response = await worker.fetch(new Request('https://vanish.sh/og.png'), {
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
    expect(response.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    expect(width).toBe(1200);
    expect(height).toBe(630);
  });
});
