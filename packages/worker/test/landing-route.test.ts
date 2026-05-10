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
    expect(html).toContain('npx vanish-cli site ./demo');
    expect(html).toContain('Agent handoff');
    expect(html).toContain('href="/auth/github"');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('mailto:abuse@vanish.sh');
  });
});
