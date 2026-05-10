import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, User } from '../types.js';
import { generateApiKey, getKeyPrefix, hashApiKey } from '../lib/api-key.js';
import { logProductEvent } from '../lib/events.js';

interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
}

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

type OAuthApiKeySource = 'cli' | 'web';

type CliAuthSession =
  | {
      status: 'pending';
      pollTokenHash: string;
      stateNonce: string;
      userCodeHash: string;
    }
  | {
      status: 'authorized';
      pollTokenHash: string;
      userCodeHash: string;
      apiKey: string;
      username: string;
    }
  | {
      status: 'ready';
      pollTokenHash: string;
      apiKey: string;
      username: string;
    };

const auth = new Hono<{ Bindings: Env }>();
const CLI_USER_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * POST /auth/cli/start - Creates a CLI login session.
 * The browser URL only receives the session + state nonce; polling requires
 * a separate token returned to the local CLI process.
 */
auth.post('/auth/cli/start', async (c) => {
  if (!c.env.GITHUB_CLIENT_ID) {
    return c.json({ error: 'GitHub OAuth not configured' }, 503);
  }

  const session = nanoid(32);
  const pollToken = nanoid(32);
  const stateNonce = nanoid(32);
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const loginUrl = new URL(`${c.env.BASE_URL}/auth/github`);
  loginUrl.searchParams.set('cli', 'true');
  loginUrl.searchParams.set('session', session);
  loginUrl.searchParams.set('nonce', stateNonce);

  await c.env.DB.prepare(`
    INSERT INTO auth_sessions (session_id, api_key, username, expires_at)
    VALUES (?, ?, NULL, ?)
  `).bind(
    session,
    JSON.stringify({
      status: 'pending',
      pollTokenHash: await hashApiKey(pollToken),
      stateNonce,
      userCodeHash: await hashApiKey(normalizeUserCode(userCode)),
    } satisfies CliAuthSession),
    expiresAt,
  ).run();

  restrictAuthCors(c);
  return c.json({
    session,
    pollToken,
    userCode,
    loginUrl: loginUrl.toString(),
    expires: expiresAt,
  }, 201);
});

/**
 * POST /auth/cli/confirm - Browser-side confirmation after GitHub OAuth.
 * Requires the short code printed by the CLI, which prevents a third party from
 * starting a session, sending the OAuth URL to a victim, and harvesting the key.
 */
auth.post('/auth/cli/confirm', async (c) => {
  const payload = await readConfirmPayload(c.req.raw);
  if (!payload?.session || !payload.code) {
    return c.html(cliConfirmPage({
      title: 'Missing confirmation code',
      body: 'Return to your terminal, run vanish login again, and enter the code shown there.',
    }), 400);
  }

  const session = await readCliAuthSession(c.env, payload.session);
  if (!session || session.status !== 'authorized') {
    return c.html(cliConfirmPage({
      title: 'CLI login expired',
      body: 'Return to your terminal and run vanish login again.',
    }), 410);
  }

  if (await hashApiKey(normalizeUserCode(payload.code)) !== session.userCodeHash) {
    return c.html(cliConfirmPage({
      title: 'Code did not match',
      body: 'Check the code in your terminal and try again.',
      sessionId: payload.session,
      retry: true,
    }), 403);
  }

  await c.env.DB.prepare(`
    UPDATE auth_sessions
    SET api_key = ?, username = ?
    WHERE session_id = ? AND expires_at > datetime('now')
  `).bind(
    JSON.stringify({
      status: 'ready',
      pollTokenHash: session.pollTokenHash,
      apiKey: session.apiKey,
      username: session.username,
    } satisfies CliAuthSession),
    session.username,
    payload.session,
  ).run();

  restrictAuthCors(c);
  return c.html(cliConfirmPage({
    title: 'CLI login confirmed',
    body: 'You can close this tab and return to your terminal.',
  }));
});

/**
 * GET /auth/github - Start GitHub OAuth flow.
 * Query params:
 *   - session: CLI session ID for polling (optional, for CLI flow)
 *   - redirect: URL to redirect to after auth (optional, for web flow)
 */
auth.get('/auth/github', async (c) => {
  const clientId = c.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: 'GitHub OAuth not configured' }, 503);
  }

  const session = c.req.query('session') || '';
  const redirect = c.req.query('redirect') || '';
  const nonce = c.req.query('nonce') || '';

  // Store session + redirect as state (will be passed through OAuth)
  const state = btoa(JSON.stringify({ session, redirect, nonce }));

  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', clientId);
  githubAuthUrl.searchParams.set('scope', 'read:user user:email');
  githubAuthUrl.searchParams.set('state', state);
  githubAuthUrl.searchParams.set('redirect_uri', `${c.env.BASE_URL}/auth/callback`);

  return c.redirect(githubAuthUrl.toString());
});

/**
 * GET /auth/callback - GitHub OAuth callback.
 * Exchanges code for token, creates/updates user, generates API key.
 */
auth.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  const stateParam = c.req.query('state') || '';

  if (!code) {
    return c.json({ error: 'Missing authorization code' }, 400);
  }

  let session = '';
  let redirect = '';
  let nonce = '';
  try {
    const parsed = JSON.parse(atob(stateParam));
    session = parsed.session || '';
    redirect = parsed.redirect || '';
    nonce = parsed.nonce || '';
  } catch {
    // Invalid state, continue without session/redirect
  }

  const secureSession = session ? await readCliAuthSession(c.env, session) : null;
  const isCliLogin = isPendingCliAuthSession(secureSession, nonce);
  if (session && !isCliLogin) {
    return c.html(cliConfirmPage({
      title: 'CLI login expired',
      body: 'Return to your terminal and run vanish login again.',
    }), 410);
  }

  // Exchange code for access token
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenResponse.json() as GitHubTokenResponse;
  if (!tokenData.access_token) {
    return c.json({ error: 'Failed to exchange code for token' }, 400);
  }

  // Fetch GitHub user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'User-Agent': 'vanish',
      'Accept': 'application/vnd.github+json',
    },
  });

  if (!userResponse.ok) {
    return c.json({ error: 'Failed to fetch GitHub user info' }, 500);
  }

  const ghUser = await userResponse.json() as GitHubUser;

  // If no public email, fetch from emails endpoint
  let email = ghUser.email;
  if (!email) {
    try {
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'User-Agent': 'vanish',
          'Accept': 'application/vnd.github+json',
        },
      });
      if (emailsResponse.ok) {
        const emails = await emailsResponse.json() as Array<{ email: string; primary: boolean }>;
        const primary = emails.find(e => e.primary);
        email = primary?.email || emails[0]?.email || null;
      }
    } catch {
      // Non-critical, continue without email
    }
  }

  // Upsert user in D1
  const existingUser = await c.env.DB.prepare(
    'SELECT id, tier FROM users WHERE github_id = ?'
  ).bind(ghUser.id).first<{ id: string; tier: string }>();

  let userId: string;
  let tier: string;

  if (existingUser) {
    userId = existingUser.id;
    tier = existingUser.tier;
    // Update username and email if changed
    await c.env.DB.prepare(`
      UPDATE users SET github_username = ?, email = COALESCE(?, email), updated_at = datetime('now')
      WHERE id = ?
    `).bind(ghUser.login, email, userId).run();
  } else {
    userId = nanoid(16);
    tier = c.env.SELF_HOSTED === 'true' ? c.env.DEFAULT_TIER : 'free';
    await c.env.DB.prepare(`
      INSERT INTO users (id, github_id, github_username, email, tier)
      VALUES (?, ?, ?, ?, ?)
    `).bind(userId, ghUser.id, ghUser.login, email, tier).run();
  }

  // If CLI session, store API key for polling
  if (isCliLogin) {
    const apiKey = await createOAuthApiKey(c.env, userId, 'cli');
    const sessionUpdate = await c.env.DB.prepare(`
      UPDATE auth_sessions
      SET api_key = ?, username = ?
      WHERE session_id = ? AND expires_at > datetime('now')
    `).bind(
      JSON.stringify({
        status: 'authorized',
        pollTokenHash: secureSession.pollTokenHash,
        userCodeHash: secureSession.userCodeHash,
        apiKey,
        username: ghUser.login,
      } satisfies CliAuthSession),
      ghUser.login,
      session,
    ).run();
    if (sessionUpdate.meta.changes === 0) {
      await revokeApiKey(c.env, apiKey);
      return c.html(cliConfirmPage({
        title: 'CLI login expired',
        body: 'Return to your terminal and run vanish login again.',
      }), 410);
    }
    await logProductEvent(c.env, {
      name: 'login_completed',
      userId,
      properties: {
        tier,
        has_cli_session: true,
        has_redirect: Boolean(redirect),
        secure_cli_flow: true,
      },
    });
    return c.html(cliConfirmPage({
      title: 'Confirm CLI login',
      body: 'Enter the code shown in your terminal to finish login.',
      sessionId: session,
      retry: true,
    }));
  }

  const apiKey = await createOAuthApiKey(c.env, userId, 'web');

  await logProductEvent(c.env, {
    name: 'login_completed',
    userId,
    properties: {
      tier,
      has_cli_session: Boolean(session),
      has_redirect: Boolean(redirect),
      secure_cli_flow: Boolean(session && nonce),
    },
  });

  // If web redirect, redirect with success
  if (redirect) {
    // For internal paths, pass the API key so the dashboard JS can store it
    try {
      const url = new URL(redirect, c.env.BASE_URL);
      if (url.origin === new URL(c.env.BASE_URL).origin) {
        url.hash = `key=${encodeURIComponent(apiKey)}`;
        return c.redirect(url.pathname + url.search + url.hash);
      }
    } catch {
      // Invalid URL, fall through to default redirect
    }
    return c.redirect(`${redirect}?success=true`);
  }

  const dashboardUrl = new URL('/dashboard', c.env.BASE_URL);
  dashboardUrl.hash = `key=${encodeURIComponent(apiKey)}`;
  return c.redirect(dashboardUrl.pathname + dashboardUrl.hash);
});

async function createOAuthApiKey(env: Env, userId: string, source: OAuthApiKeySource): Promise<string> {
  if (source === 'web') {
    return rotateWebApiKey(env, userId);
  }

  const apiKey = generateApiKey();
  await insertApiKey(env, {
    apiKey,
    userId,
    source,
  });
  return apiKey;
}

async function rotateWebApiKey(env: Env, userId: string): Promise<string> {
  try {
    return await rotateWebApiKeyOnce(env, userId);
  } catch {
    // A concurrent web login can win the unique active-web-key race. Retry once
    // so the latest completed login still owns the single active browser key.
    return rotateWebApiKeyOnce(env, userId);
  }
}

async function rotateWebApiKeyOnce(env: Env, userId: string): Promise<string> {
  const apiKey = generateApiKey();
  const keyHash = await hashApiKey(apiKey);
  const keyPrefix = getKeyPrefix(apiKey);

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE api_keys
      SET revoked_at = datetime('now')
      WHERE user_id = ? AND source = 'web' AND revoked_at IS NULL
    `).bind(userId),
    env.DB.prepare(`
      INSERT INTO api_keys (key_hash, user_id, key_prefix, name, source)
      VALUES (?, ?, ?, 'default', 'web')
    `).bind(keyHash, userId, keyPrefix),
  ]);

  return apiKey;
}

async function insertApiKey(
  env: Env,
  input: { apiKey: string; userId: string; source: OAuthApiKeySource },
): Promise<void> {
  const keyHash = await hashApiKey(input.apiKey);
  const keyPrefix = getKeyPrefix(input.apiKey);

  await env.DB.prepare(`
    INSERT INTO api_keys (key_hash, user_id, key_prefix, name, source)
    VALUES (?, ?, ?, 'default', ?)
  `).bind(keyHash, input.userId, keyPrefix, input.source).run();
}

async function revokeApiKey(env: Env, apiKey: string): Promise<void> {
  const keyHash = await hashApiKey(apiKey);
  await env.DB.prepare(`
    UPDATE api_keys
    SET revoked_at = datetime('now')
    WHERE key_hash = ? AND revoked_at IS NULL
  `).bind(keyHash).run();
}

/**
 * GET /auth/poll - CLI polls this to retrieve the API key after OAuth.
 * Returns 202 while waiting, 200 with key when ready.
 */
auth.get('/auth/poll', async (c) => {
  const session = c.req.query('session');
  const pollToken = c.req.header('X-Poll-Token') || '';
  if (!session) {
    return c.json({ error: 'Missing session parameter' }, 400);
  }

  const result = await c.env.DB.prepare(
    'SELECT api_key, username FROM auth_sessions WHERE session_id = ? AND expires_at > datetime(\'now\')'
  ).bind(session).first<{ api_key: string; username: string }>();

  if (!result || !result.api_key) {
    return c.json({ status: 'waiting' }, 202);
  }

  const payload = parseCliAuthSession(result.api_key);
  if (payload) {
    if (payload.status === 'pending' || payload.status === 'authorized') {
      restrictAuthCors(c);
      return c.json({ status: 'waiting' }, 202);
    }

    if (!pollToken || await hashApiKey(pollToken) !== payload.pollTokenHash) {
      restrictAuthCors(c);
      return c.json({ error: 'Invalid polling token' }, 401);
    }

    c.executionCtx.waitUntil(
      c.env.DB.prepare('DELETE FROM auth_sessions WHERE session_id = ?')
        .bind(session).run()
    );

    restrictAuthCors(c);
    return c.json({
      api_key: payload.apiKey,
      username: payload.username,
    }, 200);
  }

  restrictAuthCors(c);
  return c.json({ status: 'waiting' }, 202);
});

async function readCliAuthSession(env: Env, session: string): Promise<CliAuthSession | null> {
  const result = await env.DB.prepare(
    'SELECT api_key FROM auth_sessions WHERE session_id = ? AND expires_at > datetime(\'now\')'
  ).bind(session).first<{ api_key: string }>();

  return result?.api_key ? parseCliAuthSession(result.api_key) : null;
}

function parseCliAuthSession(value: string): CliAuthSession | null {
  try {
    const parsed = JSON.parse(value) as Partial<CliAuthSession>;
    if (parsed.status === 'pending' &&
      typeof parsed.pollTokenHash === 'string' &&
      typeof parsed.stateNonce === 'string' &&
      typeof parsed.userCodeHash === 'string') {
      return parsed as CliAuthSession;
    }
    if (parsed.status === 'authorized' &&
      typeof parsed.pollTokenHash === 'string' &&
      typeof parsed.userCodeHash === 'string' &&
      typeof parsed.apiKey === 'string' &&
      typeof parsed.username === 'string') {
      return parsed as CliAuthSession;
    }
    if (parsed.status === 'ready' &&
      typeof parsed.pollTokenHash === 'string' &&
      typeof parsed.apiKey === 'string' &&
      typeof parsed.username === 'string') {
      return parsed as CliAuthSession;
    }
  } catch {
    return null;
  }

  return null;
}

async function readConfirmPayload(request: Request): Promise<{ session?: string; code?: string } | null> {
  const contentType = request.headers.get('Content-Type') || '';
  try {
    if (contentType.includes('application/json')) {
      return await request.json() as { session?: string; code?: string };
    }

    const form = await request.formData();
    return {
      session: String(form.get('session') || ''),
      code: String(form.get('code') || ''),
    };
  } catch {
    return null;
  }
}

function cliConfirmPage(input: { title: string; body: string; sessionId?: string; retry?: boolean }): string {
  const form = input.retry && input.sessionId
    ? `<form method="post" action="/auth/cli/confirm">
        <input type="hidden" name="session" value="${escapeHtml(input.sessionId)}">
        <label for="code">Code from terminal</label>
        <input id="code" name="code" autocomplete="one-time-code" inputmode="text" required autofocus>
        <button type="submit">Confirm login</button>
      </form>`
    : '';

  return `<!DOCTYPE html>
<html><head><title>vanish - ${escapeHtml(input.title)}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; }
  form { display: grid; gap: 10px; margin-top: 24px; max-width: 280px; }
  input { font: inherit; padding: 10px 12px; border: 1px solid #ccc; border-radius: 6px; text-transform: uppercase; }
  button { font: inherit; padding: 10px 14px; background: #111827; color: #f9fafb; border: 0; border-radius: 6px; cursor: pointer; }
</style></head>
<body>
  <h1>${escapeHtml(input.title)}</h1>
  <p>${escapeHtml(input.body)}</p>
  ${form}
</body></html>`;
}

function isPendingCliAuthSession(
  session: CliAuthSession | null,
  nonce: string,
): session is Extract<CliAuthSession, { status: 'pending' }> {
  return session?.status === 'pending' && session.stateNonce === nonce;
}

function generateUserCode(): string {
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of bytes) {
    code += CLI_USER_CODE_ALPHABET[byte % CLI_USER_CODE_ALPHABET.length];
  }
  return code;
}

function normalizeUserCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function restrictAuthCors(c: { header: (name: string, value: string) => void; env: Env }): void {
  c.header('Access-Control-Allow-Origin', new URL(c.env.BASE_URL).origin);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default auth;
