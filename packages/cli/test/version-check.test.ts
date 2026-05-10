import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getVersionNotice,
  shouldCheckForVersionNotice,
} from '../src/lib/version-check.js';

function cachePath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'vanish-version-test-'));
  return { dir, path: join(dir, 'version-check.json') };
}

function fetchJson(data: unknown, ok = true): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(data),
  }) as unknown as typeof fetch;
}

describe('version check', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns no notice when current equals latest', async () => {
    const { dir, path } = cachePath();
    const fetchImpl = fetchJson({ version: '0.1.10' });

    try {
      await expect(getVersionNotice('0.1.10', { fetchImpl, cachePath: path })).resolves.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns a notice when current is older than latest', async () => {
    const { dir, path } = cachePath();
    const fetchImpl = fetchJson({ version: '0.1.11' });

    try {
      const notice = await getVersionNotice('0.1.10', { fetchImpl, cachePath: path });

      expect(notice).toMatchObject({
        currentVersion: '0.1.10',
        latestVersion: '0.1.11',
        message: 'vanish-cli 0.1.10 is out of date. Latest is 0.1.11.\nRun: vanish update',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats stable releases as newer than matching prereleases', async () => {
    const { dir, path } = cachePath();
    const fetchImpl = fetchJson({ version: '1.0.0' });

    try {
      const notice = await getVersionNotice('1.0.0-beta.1', { fetchImpl, cachePath: path });

      expect(notice).toMatchObject({
        currentVersion: '1.0.0-beta.1',
        latestVersion: '1.0.0',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('compares prerelease identifiers using semver precedence', async () => {
    const { dir, path } = cachePath();
    const fetchImpl = fetchJson({ version: '1.0.0-beta.2' });

    try {
      const notice = await getVersionNotice('1.0.0-beta.1', { fetchImpl, cachePath: path });

      expect(notice?.latestVersion).toBe('1.0.0-beta.2');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves hyphens inside prerelease identifiers', async () => {
    const { dir, path } = cachePath();
    const fetchImpl = fetchJson({ version: '1.0.0-alpha-beta.2' });

    try {
      const notice = await getVersionNotice('1.0.0-alpha-beta.1', { fetchImpl, cachePath: path });

      expect(notice?.latestVersion).toBe('1.0.0-alpha-beta.2');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses ASCII ordering for non-numeric prerelease identifiers', async () => {
    const { dir, path } = cachePath();
    const fetchImpl = fetchJson({ version: '1.0.0-alpha.a' });

    try {
      const notice = await getVersionNotice('1.0.0-alpha.Z', { fetchImpl, cachePath: path });

      expect(notice?.latestVersion).toBe('1.0.0-alpha.a');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('compares large numeric prerelease identifiers without precision loss', async () => {
    const { dir, path } = cachePath();
    const fetchImpl = fetchJson({ version: '1.0.0-beta.9007199254740993' });

    try {
      const notice = await getVersionNotice('1.0.0-beta.9007199254740992', { fetchImpl, cachePath: path });

      expect(notice?.latestVersion).toBe('1.0.0-beta.9007199254740993');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips when the registry request fails or returns invalid data', async () => {
    const { dir, path } = cachePath();

    try {
      await expect(getVersionNotice('0.1.10', {
        fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch,
        cachePath: path,
      })).resolves.toBeNull();

      await expect(getVersionNotice('0.1.10', {
        fetchImpl: fetchJson({ name: 'vanish-cli' }),
        cachePath: path,
      })).resolves.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses a fresh cache instead of fetching again', async () => {
    const { dir, path } = cachePath();
    const fetchImpl = fetchJson({ version: '0.1.99' });
    writeFileSync(path, JSON.stringify({
      checkedAt: 1_000,
      latestVersion: '0.1.10',
    }));

    try {
      await expect(getVersionNotice('0.1.10', {
        now: 1_000 + 60_000,
        fetchImpl,
        cachePath: path,
      })).resolves.toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats malformed cache JSON as a cache miss', async () => {
    const { dir, path } = cachePath();
    const fetchImpl = fetchJson({ version: '0.1.11' });
    writeFileSync(path, '{bad json');

    try {
      const notice = await getVersionNotice('0.1.10', {
        now: 1_000 + 60_000,
        fetchImpl,
        cachePath: path,
      });

      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(notice?.latestVersion).toBe('0.1.11');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats malformed cache shape as a cache miss', async () => {
    const { dir, path } = cachePath();
    const fetchImpl = fetchJson({ version: '0.1.11' });
    writeFileSync(path, JSON.stringify({ checkedAt: 'yesterday' }));

    try {
      const notice = await getVersionNotice('0.1.10', {
        now: 1_000 + 60_000,
        fetchImpl,
        cachePath: path,
      });

      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(notice?.latestVersion).toBe('0.1.11');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refreshes a stale cache', async () => {
    const { dir, path } = cachePath();
    const fetchImpl = fetchJson({ version: '0.1.12' });
    writeFileSync(path, JSON.stringify({
      checkedAt: 1_000,
      latestVersion: '0.1.10',
    }));

    try {
      const notice = await getVersionNotice('0.1.10', {
        now: 1_000 + 25 * 60 * 60 * 1000,
        fetchImpl,
        cachePath: path,
      });

      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(notice?.latestVersion).toBe('0.1.12');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips commands that must not show update notices', () => {
    expect(shouldCheckForVersionNotice(['update'])).toBe(false);
    expect(shouldCheckForVersionNotice(['--version'])).toBe(false);
    expect(shouldCheckForVersionNotice(['site', '--help'])).toBe(false);
    expect(shouldCheckForVersionNotice(['site', './demo', '--json'])).toBe(false);
    expect(shouldCheckForVersionNotice(['site', './demo'])).toBe(true);
  });
});
