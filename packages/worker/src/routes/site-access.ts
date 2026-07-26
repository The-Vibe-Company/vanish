import { Hono } from 'hono';
import type { Env, SiteAccess } from '../types.js';
import { getRateLimitIdentifier } from '../lib/rate-limit.js';
import {
  createAccessCookie,
  accessProtectionConfigured,
  getSiteAccess,
  hashSitePassword,
  renderPasswordGate,
  sanitizeReturnPath,
  verifySitePassword,
} from '../lib/site-access.js';
import { getSiteByIdentifier } from './sites.js';

const accessRoutes = new Hono<{ Bindings: Env }>();

accessRoutes.get('/sites/:id/access', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);

  const site = await getSiteByIdentifier(c.env, c.req.param('id'));
  if (!site) return c.json({ error: 'Site not found', code: 'site_not_found' }, 404);
  if (site.user_id !== user.id) return c.json({ error: 'Not authorized', code: 'forbidden' }, 403);

  const access = await getSiteAccess(c.env, site.id);
  return c.json({
    siteId: site.id,
    mode: access?.mode || 'link',
    policyVersion: access?.policy_version || 1,
    passwordConfigured: access?.mode === 'password',
  });
});

accessRoutes.patch('/sites/:id/access', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);

  const site = await getSiteByIdentifier(c.env, c.req.param('id'));
  if (!site) return c.json({ error: 'Site not found', code: 'site_not_found' }, 404);
  if (site.user_id !== user.id) return c.json({ error: 'Not authorized', code: 'forbidden' }, 403);
  if (!site.published_at) return c.json({ error: 'Publish the site before changing access', code: 'site_not_published' }, 409);

  const payload = await c.req.json<{ mode?: string; password?: string }>().catch(() => null);
  if (!payload || (payload.mode !== 'link' && payload.mode !== 'password')) {
    return c.json({ error: 'mode must be link or password', code: 'invalid_access_mode' }, 400);
  }

  let updatedAccess: { policy_version: number } | null;
  if (payload.mode === 'link') {
    updatedAccess = await c.env.DB.prepare(`
      INSERT INTO site_access (site_id, mode, password_hash, password_salt, policy_version)
      VALUES (?, 'link', NULL, NULL, 1)
      ON CONFLICT(site_id) DO UPDATE SET
        mode = 'link',
        password_hash = NULL,
        password_salt = NULL,
        policy_version = site_access.policy_version + 1,
        updated_at = datetime('now')
      RETURNING policy_version
    `).bind(site.id).first<{ policy_version: number }>();
  } else {
    if (!accessProtectionConfigured(c.env)) {
      return c.json({
        error: 'Password access is not configured on this instance',
        code: 'access_protection_unavailable',
      }, 503);
    }
    if (typeof payload.password !== 'string' || payload.password.length < 8 || payload.password.length > 128) {
      return c.json({
        error: 'password must contain between 8 and 128 characters',
        code: 'invalid_password',
      }, 400);
    }
    const password = await hashSitePassword(payload.password);
    updatedAccess = await c.env.DB.prepare(`
      INSERT INTO site_access (site_id, mode, password_hash, password_salt, policy_version)
      VALUES (?, 'password', ?, ?, 1)
      ON CONFLICT(site_id) DO UPDATE SET
        mode = 'password',
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        policy_version = site_access.policy_version + 1,
        updated_at = datetime('now')
      RETURNING policy_version
    `).bind(site.id, password.hash, password.salt).first<{ policy_version: number }>();
  }

  if (!updatedAccess) {
    return c.json({ error: 'Failed to update site access', code: 'access_update_failed' }, 500);
  }

  return c.json({
    siteId: site.id,
    mode: payload.mode,
    policyVersion: updatedAccess.policy_version,
    passwordConfigured: payload.mode === 'password',
  });
});

accessRoutes.post('/.vanish/access', async (c) => {
  const contentType = c.req.header('Content-Type') || '';
  let siteId = '';
  let password = '';
  let returnPath = '/';

  if (contentType.includes('application/json')) {
    const payload = await c.req.json<unknown>().catch(() => null);
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      ('site' in payload && typeof payload.site !== 'string') ||
      ('password' in payload && typeof payload.password !== 'string') ||
      ('return' in payload && typeof payload.return !== 'string')
    ) {
      return c.json({ error: 'site, password, and return must be strings', code: 'invalid_request' }, 400);
    }
    const fields = payload as { site?: string; password?: string; return?: string };
    siteId = fields.site || '';
    password = fields.password || '';
    returnPath = sanitizeReturnPath(fields.return);
  } else {
    const form = await c.req.formData().catch(() => null);
    siteId = String(form?.get('site') || '');
    password = String(form?.get('password') || '');
    returnPath = sanitizeReturnPath(String(form?.get('return') || '/'));
  }

  const access = siteId ? await getSiteAccess(c.env, siteId) : null;
  if (!access || access.mode !== 'password' || !access.password_hash || !access.password_salt) {
    return c.json({ error: 'Protected site not found', code: 'protected_site_not_found' }, 404);
  }
  if (!accessProtectionConfigured(c.env)) {
    return c.json({ error: 'Password access is unavailable', code: 'access_protection_unavailable' }, 503);
  }
  if (password.length < 8 || password.length > 128) {
    if (contentType.includes('application/json')) {
      return c.json({
        error: 'password must contain between 8 and 128 characters',
        code: 'invalid_password',
      }, 400);
    }
    return renderPasswordGate(siteId, returnPath, true);
  }

  const identifier = getRateLimitIdentifier(
    null,
    c.req.header('CF-Connecting-IP') || null,
    c.req.header('X-Forwarded-For') || null,
  );
  const action = `site-password:${siteId}`;
  const reservation = await c.env.DB.prepare(`
    INSERT INTO rate_limits (identifier, action)
    SELECT ?, ?
    WHERE (
      SELECT COUNT(*)
      FROM rate_limits
      WHERE identifier = ? AND action = ? AND created_at > datetime('now', '-15 minutes')
    ) < 10
  `).bind(identifier, action, identifier, action).run();
  if ((reservation.meta?.changes || 0) !== 1) {
    return c.json({ error: 'Too many password attempts', code: 'rate_limit_exceeded' }, 429);
  }

  const valid = await verifySitePassword(password, access.password_hash, access.password_salt);
  if (!valid) {
    if (contentType.includes('application/json')) {
      return c.json({ error: 'Invalid password', code: 'invalid_password' }, 401);
    }
    return renderPasswordGate(siteId, returnPath, true);
  }

  const cookie = await createAccessCookie(siteId, access.policy_version, c.env.ACCESS_SESSION_SECRET!);
  if (contentType.includes('application/json')) {
    c.header('Set-Cookie', cookie);
    return c.json({ ok: true, return: returnPath });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: returnPath,
      'Set-Cookie': cookie,
      'Cache-Control': 'private, no-store',
    },
  });
});

export default accessRoutes;
