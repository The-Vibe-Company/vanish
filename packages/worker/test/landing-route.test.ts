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
    expect(html).toContain('<title>vanish — temporary URLs from your terminal</title>');
    expect(html).toContain('Temporary public URLs');
    expect(html).toContain('for <em><span class="serif">agent-built work.</span></em>');
    expect(html).toContain('npx vanish-cli site ./demo --root index.html');
    expect(html).toContain('npm install -g vanish-cli');
    expect(html).toContain('Native skills for');
    expect(html).toContain('npx skills add The-Vibe-Company/vanish');
    expect(html).not.toContain('02 — Why Vanish');
    expect(html).not.toContain('href="#features"');
    expect(html).toContain('href="/auth/github?redirect=/dashboard"');
    expect(html).not.toContain('href="/auth/github">');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('mailto:abuse@vanish.sh');
  });
});
