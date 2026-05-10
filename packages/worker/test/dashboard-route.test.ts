import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/types.js';

describe('dashboard route', () => {
  it('offers GitHub connect and existing API key login options', async () => {
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
    const html = await response.text();
    expect(html).toContain('href="/auth/github?redirect=/dashboard"');
    expect(html).toContain('Connect with GitHub');
    expect(html).toContain('placeholder="vnsh_..."');
    expect(html).toContain('Use API key');
  });
});
