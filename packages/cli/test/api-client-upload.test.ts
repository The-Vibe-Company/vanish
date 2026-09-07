import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VanishClient } from '../src/lib/api-client.js';

describe('VanishClient upload requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends Content-Length for direct, site, and bundle uploads', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vanish-api-client-test-'));
    const file = join(dir, 'preview.png');
    writeFileSync(file, 'png');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        url: 'https://vanish.sh/f/upload123.png',
        id: 'upload123',
        filename: 'preview.png',
        size: 3,
        expires: null,
      }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const client = new VanishClient({ api_url: 'https://vanish.test' });
      await client.upload(file);
      await client.uploadSiteFile('site123', 'vnst_token', file, 'preview.png');
      await client.uploadBundleFile('bundle123', 'vnbd_token', file, 'preview.png');

      expect(fetchMock).toHaveBeenCalledTimes(3);
      for (const [, init] of fetchMock.mock.calls) {
        expect(new Headers(init?.headers).get('Content-Length')).toBe('3');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
