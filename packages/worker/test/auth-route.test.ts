import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index.js';
import type { Env, Tier, User } from '../src/types.js';

describe('auth routes', () => {
  let db: AuthDB;
  let env: Env;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = new AuthDB();
    env = {
      DB: db as unknown as D1Database,
      BUCKET: {} as R2Bucket,
      BASE_URL: 'https://vanish.sh',
      SELF_HOSTED: 'false',
      DEFAULT_TIER: 'free',
      GITHUB_CLIENT_ID: 'github-client',
      GITHUB_CLIENT_SECRET: 'github-secret',
    };
    fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://github.com/login/oauth/access_token') {
        return Response.json({ access_token: 'gh_token', token_type: 'bearer', scope: 'read:user' });
      }
      if (url === 'https://api.github.com/user') {
        return Response.json({ id: 123, login: 'stan', email: 'stan@example.com' });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires browser confirmation code before CLI polling returns an API key', async () => {
    const started = await request(env, '/auth/cli/start', { method: 'POST' });
    expect(started.status).toBe(201);
    expect(started.headers.get('Access-Control-Allow-Origin')).toBe('https://vanish.sh');
    const start = await started.json() as { session: string; pollToken: string; userCode: string; loginUrl: string };
    expect(start.userCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(start.loginUrl).not.toContain(start.userCode);

    const github = await requestAbsolute(env, start.loginUrl);
    const githubLocation = github.headers.get('Location');
    expect(githubLocation).toBeTruthy();
    const state = new URL(githubLocation!).searchParams.get('state');
    expect(state).toBeTruthy();

    const callback = await request(env, `/auth/callback?code=abc123&state=${encodeURIComponent(state!)}`);
    expect(callback.status).toBe(200);
    const callbackHtml = await callback.text();
    expect(callbackHtml).toContain('Confirm CLI login');
    expect(callbackHtml).not.toContain('vnsh_');

    const waiting = await request(env, `/auth/poll?session=${start.session}`, {
      headers: { 'X-Poll-Token': start.pollToken },
    });
    expect(waiting.status).toBe(202);

    const badConfirm = await request(env, '/auth/cli/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: start.session, code: 'WRONG1' }),
    });
    expect(badConfirm.status).toBe(403);

    const confirm = await request(env, '/auth/cli/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: start.session, code: start.userCode }),
    });
    expect(confirm.status).toBe(200);
    expect(await confirm.text()).toContain('CLI login confirmed');

    const queryToken = await request(env, `/auth/poll?session=${start.session}&token=${start.pollToken}`);
    expect(queryToken.status).toBe(401);

    const polled = await request(env, `/auth/poll?session=${start.session}`, {
      headers: { 'X-Poll-Token': start.pollToken },
    });
    expect(polled.status).toBe(200);
    expect(await polled.json()).toMatchObject({ username: 'stan' });
  });

  it('does not return legacy raw API key sessions from CLI polling', async () => {
    db.authSessions.set('legacy', {
      api_key: 'vnsh_raw_legacy_key',
      username: 'legacy',
      expires_at: future(),
    });

    const response = await request(env, '/auth/poll?session=legacy');

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: 'waiting' });
  });

  it('redirects web GitHub login to the dashboard with a browser key', async () => {
    const github = await request(env, '/auth/github?redirect=/dashboard');
    const githubLocation = github.headers.get('Location');
    expect(githubLocation).toBeTruthy();
    const state = new URL(githubLocation!).searchParams.get('state');
    expect(state).toBeTruthy();

    const callback = await request(env, `/auth/callback?code=abc123&state=${encodeURIComponent(state!)}`);

    expect(callback.status).toBe(302);
    const location = callback.headers.get('Location');
    expect(location).toMatch(/^\/dashboard#key=vnsh_/);
  });

  it('rotates the active web API key on repeated dashboard logins', async () => {
    const first = await request(env, '/auth/callback?code=abc123');
    expect(first.status).toBe(302);
    const firstKey = keyFromRedirect(first.headers.get('Location'));

    const second = await request(env, '/auth/callback?code=abc123');
    expect(second.status).toBe(302);
    const secondKey = keyFromRedirect(second.headers.get('Location'));

    expect(secondKey).not.toBe(firstKey);

    const webKeys = Array.from(db.apiKeys.values()).filter(key => key.source === 'web');
    expect(webKeys).toHaveLength(2);
    expect(webKeys.filter(key => key.revoked_at === null)).toHaveLength(1);
    expect(webKeys.find(key => key.key_prefix === keyPrefix(firstKey))?.revoked_at).not.toBeNull();
    expect(webKeys.find(key => key.key_prefix === keyPrefix(secondKey))?.revoked_at).toBeNull();
  });

  it('does not revoke the active web API key during CLI login', async () => {
    const webLogin = await request(env, '/auth/callback?code=abc123');
    const webKey = keyFromRedirect(webLogin.headers.get('Location'));

    const started = await request(env, '/auth/cli/start', { method: 'POST' });
    const start = await started.json() as { loginUrl: string };
    const github = await requestAbsolute(env, start.loginUrl);
    const state = new URL(github.headers.get('Location')!).searchParams.get('state');

    const cliCallback = await request(env, `/auth/callback?code=abc123&state=${encodeURIComponent(state!)}`);

    expect(cliCallback.status).toBe(200);
    const keys = Array.from(db.apiKeys.values());
    expect(keys.filter(key => key.source === 'web' && key.revoked_at === null)).toHaveLength(1);
    expect(keys.find(key => key.key_prefix === keyPrefix(webKey))?.revoked_at).toBeNull();
    expect(keys.filter(key => key.source === 'cli' && key.revoked_at === null)).toHaveLength(1);
  });

  it('rejects invalid CLI callbacks without rotating the active web API key', async () => {
    const webLogin = await request(env, '/auth/callback?code=abc123');
    const webKey = keyFromRedirect(webLogin.headers.get('Location'));
    const started = await request(env, '/auth/cli/start', { method: 'POST' });
    const start = await started.json() as { session: string };
    const invalidState = btoa(JSON.stringify({
      session: start.session,
      nonce: 'wrong-nonce',
    }));
    fetchMock.mockClear();

    const invalidCallback = await request(env, `/auth/callback?code=abc123&state=${encodeURIComponent(invalidState)}`);

    expect(invalidCallback.status).toBe(410);
    expect(await invalidCallback.text()).toContain('CLI login expired');
    expect(fetchMock).not.toHaveBeenCalled();
    const keys = Array.from(db.apiKeys.values());
    expect(keys.find(key => key.key_prefix === keyPrefix(webKey))?.revoked_at).toBeNull();
    expect(keys.filter(key => key.source === 'web' && key.revoked_at === null)).toHaveLength(1);
    expect(keys.filter(key => key.source === 'cli')).toHaveLength(0);
  });

  it('preserves manual and legacy default keys when dashboard login rotates web keys', async () => {
    const first = await request(env, '/auth/callback?code=abc123');
    const firstKey = keyFromRedirect(first.headers.get('Location'));
    const userId = Array.from(db.users.values())[0].id;
    db.apiKeys.set('manual-hash', {
      user_id: userId,
      key_prefix: 'vnsh_manual123',
      name: 'manual',
      source: 'manual',
      revoked_at: null,
    });
    db.apiKeys.set('legacy-default-hash', {
      user_id: userId,
      key_prefix: 'vnsh_legacy123',
      name: 'default',
      source: 'manual',
      revoked_at: null,
    });

    const second = await request(env, '/auth/callback?code=abc123');
    const secondKey = keyFromRedirect(second.headers.get('Location'));

    const keys = Array.from(db.apiKeys.values());
    expect(keys.find(key => key.key_prefix === 'vnsh_manual123')?.revoked_at).toBeNull();
    expect(keys.find(key => key.key_prefix === 'vnsh_legacy123')?.revoked_at).toBeNull();
    expect(keys.find(key => key.key_prefix === keyPrefix(firstKey))?.revoked_at).not.toBeNull();
    expect(keys.find(key => key.key_prefix === keyPrefix(secondKey))?.revoked_at).toBeNull();
    expect(keys.filter(key => key.source === 'web' && key.revoked_at === null)).toHaveLength(1);
  });

  it('redirects default browser GitHub login to the dashboard instead of showing an API key page', async () => {
    const callback = await request(env, '/auth/callback?code=abc123');

    expect(callback.status).toBe(302);
    const location = callback.headers.get('Location');
    expect(location).toMatch(/^\/dashboard#key=vnsh_/);
  });
});

function request(env: Env, path: string, init?: RequestInit) {
  return requestAbsolute(env, `https://vanish.sh${path}`, init);
}

function requestAbsolute(env: Env, url: string, init?: RequestInit) {
  return worker.fetch(new Request(url, init), env, {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext);
}

function future(): string {
  return new Date(Date.now() + 60_000).toISOString();
}

function keyFromRedirect(location: string | null): string {
  expect(location).toBeTruthy();
  const url = new URL(location!, 'https://vanish.sh');
  const key = new URLSearchParams(url.hash.slice(1)).get('key');
  expect(key).toMatch(/^vnsh_/);
  return key!;
}

function keyPrefix(apiKey: string): string {
  return apiKey.slice(0, 15);
}

type AuthApiKey = {
  user_id: string;
  key_prefix: string;
  name: string;
  source: 'manual' | 'web' | 'cli';
  revoked_at: string | null;
};

class AuthDB {
  users = new Map<number, User>();
  apiKeys = new Map<string, AuthApiKey>();
  authSessions = new Map<string, { api_key: string | null; username: string | null; expires_at: string }>();
  events: Array<{ name: string; user_id: string | null; properties: string }> = [];

  prepare(sql: string): AuthStatement {
    return new AuthStatement(this, sql);
  }

  async batch(statements: AuthStatement[]): Promise<void[]> {
    const snapshot = new Map(
      Array.from(this.apiKeys.entries()).map(([hash, key]) => [hash, { ...key }])
    );
    try {
      const results: void[] = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    } catch (error) {
      this.apiKeys = snapshot;
      throw error;
    }
  }
}

class AuthStatement {
  private args: unknown[] = [];

  constructor(private db: AuthDB, private sql: string) {}

  bind(...args: unknown[]): AuthStatement {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const sql = normalizeSql(this.sql);

    if (sql.includes('FROM api_keys ak JOIN users u')) {
      const [keyHash] = this.args as [string];
      const key = this.db.apiKeys.get(keyHash);
      const user = key && key.revoked_at === null
        ? Array.from(this.db.users.values()).find(row => row.id === key.user_id)
        : null;
      return (user || null) as T | null;
    }

    if (sql.includes('SELECT api_key FROM auth_sessions')) {
      const [sessionId] = this.args as [string];
      const session = this.db.authSessions.get(sessionId);
      return (session ? { api_key: session.api_key } : null) as T | null;
    }

    if (sql.includes('SELECT api_key, username FROM auth_sessions')) {
      const [sessionId] = this.args as [string];
      const session = this.db.authSessions.get(sessionId);
      return (session ? { api_key: session.api_key, username: session.username } : null) as T | null;
    }

    if (sql.includes('SELECT id, tier FROM users WHERE github_id = ?')) {
      const [githubId] = this.args as [number];
      const user = this.db.users.get(githubId);
      return (user ? { id: user.id, tier: user.tier } : null) as T | null;
    }

    throw new Error(`Unhandled first query: ${sql}`);
  }

  async run(): Promise<void> {
    const sql = normalizeSql(this.sql);

    if (sql.includes('UPDATE api_keys SET last_used_at')) {
      return;
    }

    if (sql.includes('UPDATE api_keys SET revoked_at')) {
      const [userId] = this.args as [string];
      for (const key of this.db.apiKeys.values()) {
        if (key.user_id === userId && key.source === 'web' && key.revoked_at === null) {
          key.revoked_at = new Date().toISOString();
        }
      }
      return;
    }

    if (sql.includes('INSERT INTO auth_sessions')) {
      const [sessionId, apiKey, expiresAt] = this.args as [string, string, string];
      this.db.authSessions.set(sessionId, { api_key: apiKey, username: null, expires_at: expiresAt });
      return;
    }

    if (sql.includes('UPDATE auth_sessions SET api_key = ?, username = ?')) {
      const [apiKey, username, sessionId] = this.args as [string, string, string];
      const session = this.db.authSessions.get(sessionId);
      if (session) {
        session.api_key = apiKey;
        session.username = username;
      }
      return;
    }

    if (sql.includes('DELETE FROM auth_sessions')) {
      const [sessionId] = this.args as [string];
      this.db.authSessions.delete(sessionId);
      return;
    }

    if (sql.includes('INSERT INTO users')) {
      const [id, githubId, githubUsername, email, tier] = this.args as [string, number, string, string | null, Tier];
      this.db.users.set(githubId, {
        id,
        github_id: githubId,
        github_username: githubUsername,
        email,
        tier,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return;
    }

    if (sql.includes('UPDATE users SET github_username')) {
      const [githubUsername, email, userId] = this.args as [string, string | null, string];
      for (const user of this.db.users.values()) {
        if (user.id === userId) {
          user.github_username = githubUsername;
          user.email = email || user.email;
        }
      }
      return;
    }

    if (sql.includes('INSERT INTO api_keys')) {
      const [keyHash, userId, keyPrefix] = this.args as [string, string, string];
      const key = this.readApiKeyInsert(keyHash, userId, keyPrefix, sql);
      const activeWebExists = Array.from(this.db.apiKeys.values()).some(row =>
        row.user_id === key.user_id &&
        row.source === 'web' &&
        row.revoked_at === null
      );
      if (key.source === 'web' && activeWebExists) {
        throw new Error('UNIQUE constraint failed: api_keys.user_id');
      }
      this.db.apiKeys.set(keyHash, key);
      return;
    }

    if (sql.includes('INSERT INTO events')) {
      const [, name, userId, , , properties] = this.args as [string, string, string | null, null, null, string];
      this.db.events.push({ name, user_id: userId, properties });
      return;
    }

    throw new Error(`Unhandled run query: ${sql}`);
  }

  private readApiKeyInsert(keyHash: string, userId: string, keyPrefix: string, sql: string): AuthApiKey {
    if (sql.includes("VALUES (?, ?, ?, 'default', 'web')")) {
      return { user_id: userId, key_prefix: keyPrefix, name: 'default', source: 'web', revoked_at: null };
    }
    if (sql.includes("VALUES (?, ?, ?, 'default', ?)")) {
      const source = this.args[3] as AuthApiKey['source'];
      return { user_id: userId, key_prefix: keyPrefix, name: 'default', source, revoked_at: null };
    }
    if (sql.includes("VALUES (?, ?, ?, ?, 'manual')")) {
      const name = this.args[3] as string;
      return { user_id: userId, key_prefix: keyPrefix, name, source: 'manual', revoked_at: null };
    }

    throw new Error(`Unhandled api key insert query: ${sql} (${keyHash})`);
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}
