import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import worker from '../src/index.js';
import statsRoutes from '../src/routes/stats.js';
import type { Env } from '../src/types.js';

describe('GET /api/stats', () => {
  let db: DatabaseSync;
  let env: Env;
  let prepare: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
    db = new DatabaseSync(':memory:');
    db.exec(readFileSync(new URL('../src/db/schema.sql', import.meta.url), 'utf8'));
    // Execute the production SQL against SQLite rather than mocking counts.
    prepare = vi.fn((sql: string) => ({
      bind: (...args: string[]) => ({
        first: async () => db.prepare(sql).get(...args),
      }),
    }));
    env = {
      DB: { prepare } as unknown as D1Database,
      BUCKET: {} as R2Bucket,
      BASE_URL: 'https://vanish.sh',
      SELF_HOSTED: 'false',
      DEFAULT_TIER: 'free',
      STATS_TOKEN: crypto.randomUUID(),
    };
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  it.each([
    undefined,
    'Bearer wrong',
    'Bearer ',
    'Basic wrong',
    'Bearer vnsh_wrong',
  ])('rejects missing or invalid authorization (%s) without database access', async (authorization) => {
    const response = await request(authorization);
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('does not accept the token in a query string', async () => {
    const response = await worker.fetch(
      new Request(`https://vanish.sh/api/stats?key=${env.STATS_TOKEN}`), env,
    );
    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])('fails closed when STATS_TOKEN is unset or empty', async (token) => {
    const authorization = `Bearer ${env.STATS_TOKEN}`;
    env.STATS_TOKEN = token;
    const response = await request(authorization);
    expect(response.status).toBe(503);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('returns exactly five integer zero counts for an empty database', async () => {
    const response = await request(`Bearer ${env.STATS_TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      total_users: 0, new_users_1d: 0, new_users_7d: 0,
      active_users_1d: 0, active_users_7d: 0,
    });
  });

  it('counts UTC rolling windows, distinct active users, and activity on revoked keys', async () => {
    const dates = [
      '2026-10-19 12:00:00', // now
      '2026-10-18T12:00:00.000Z', // exactly 24h ago
      '2026-10-18 11:59:59', // just outside 1d
      '2026-10-12 12:00:00', // exactly 7d ago
      '2026-10-12T11:59:59.000Z', // just outside 7d
      '2026-09-01 00:00:00',
      '2026-10-19 12:00:01', // future: total only
    ];
    dates.forEach((date, index) => {
      db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').run(`user-${index}`, date);
    });
    const key = db.prepare(`
      INSERT INTO api_keys (key_hash, user_id, last_used_at, revoked_at)
      VALUES (?, ?, ?, ?)
    `);
    key.run('a', 'user-0', dates[0], null);
    key.run('b', 'user-0', dates[1], null); // same user, twice
    key.run('c', 'user-1', dates[1], dates[0]); // revoked after real activity
    key.run('d', 'user-2', dates[2], null);
    key.run('e', 'user-3', dates[3], null);
    key.run('f', 'user-4', dates[4], null);
    key.run('g', 'user-5', null, null); // created/updated timestamps are not activity
    key.run('h', 'user-6', dates[6], null);

    const response = await request(`Bearer ${env.STATS_TOKEN}`);
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, number>;
    expect(body).toEqual({
      total_users: 7, new_users_1d: 2, new_users_7d: 4,
      active_users_1d: 2, active_users_7d: 4,
    });
    expect(Object.values(body).every(Number.isInteger)).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('uses service auth even when the configured token has an API-key prefix', async () => {
    env.STATS_TOKEN = `vnsh_${crypto.randomUUID()}`;
    const response = await request(`Bearer ${env.STATS_TOKEN}`);
    expect(response.status).toBe(200);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it.each(['preview.vanish.sh', 'portfolio.example.com'])('preserves hosted site paths on %s', async (host) => {
    const app = new Hono<{ Bindings: Env }>();
    app.route('/', statsRoutes);
    app.get('/api/stats', (c) => c.text('hosted asset'));
    // Host takes precedence, as it does in the existing site middleware.
    const response = await app.fetch(new Request('https://vanish.sh/api/stats', {
      headers: { Host: host },
    }), env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hosted asset');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('accepts the canonical www alias', async () => {
    const response = await worker.fetch(new Request('https://www.vanish.sh/api/stats', {
      headers: { Authorization: `Bearer ${env.STATS_TOKEN}` },
    }), env);
    expect(response.status).toBe(200);
  });

  function request(authorization?: string): Promise<Response> {
    return Promise.resolve(worker.fetch(new Request('https://vanish.sh/api/stats', {
      headers: authorization ? { Authorization: authorization } : {},
    }), env));
  }
});
