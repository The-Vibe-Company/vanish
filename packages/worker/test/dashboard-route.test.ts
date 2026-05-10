import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/types.js';

describe('dashboard route', () => {
  it('updates countdowns without rerendering the whole page every second', async () => {
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

    expect(html).toContain('data-countdown-expires');
    expect(html).toContain('function updateVisibleCountdowns()');
    expect(html).not.toMatch(/setInterval\(function\(\) \{[\s\S]*?rerenderMain\(\);\s*\}\s*}, 1000\);/);
  });
});
