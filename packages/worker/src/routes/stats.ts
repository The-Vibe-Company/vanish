import { Hono } from 'hono';
import type { Env } from '../types.js';

interface Stats {
  total_users: number;
  new_users_1d: number;
  new_users_7d: number;
  active_users_1d: number;
  active_users_7d: number;
}

const stats = new Hono<{ Bindings: Env }>();

stats.get('/api/stats', async (c, next) => {
  // Published sites own all paths on their hosts, including /api/stats.
  const hostname = new URL(`https://${c.req.header('Host') || new URL(c.req.url).host}`).hostname.toLowerCase();
  const baseHostname = new URL(c.env.BASE_URL).hostname.toLowerCase();
  if (hostname !== baseHostname && hostname !== `www.${baseHostname}`) {
    return next();
  }

  c.header('Cache-Control', 'no-store');
  if (!c.env.STATS_TOKEN) {
    return c.json({ error: 'Stats unavailable' }, 503);
  }

  const authorization = c.req.header('Authorization');
  if (!authorization?.startsWith('Bearer ') ||
      !(await tokenMatches(authorization.slice(7), c.env.STATS_TOKEN))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // One clock and one query give consistent rolling UTC windows. EXISTS counts
  // each user once, including activity on keys revoked after their last use.
  const result = await c.env.DB.prepare(`
    WITH clock AS (SELECT julianday(?) AS now)
    SELECT COUNT(*) AS total_users,
      COALESCE(SUM(julianday(u.created_at) BETWEEN now - 1 AND now), 0) AS new_users_1d,
      COALESCE(SUM(julianday(u.created_at) BETWEEN now - 7 AND now), 0) AS new_users_7d,
      COALESCE(SUM(EXISTS (
        SELECT 1 FROM api_keys ak WHERE ak.user_id = u.id
          AND julianday(ak.last_used_at) BETWEEN now - 1 AND now
      )), 0) AS active_users_1d,
      COALESCE(SUM(EXISTS (
        SELECT 1 FROM api_keys ak WHERE ak.user_id = u.id
          AND julianday(ak.last_used_at) BETWEEN now - 7 AND now
      )), 0) AS active_users_7d
    FROM users u CROSS JOIN clock
  `).bind(new Date().toISOString()).first<Stats>();

  if (!result) {
    return c.json({ error: 'Stats unavailable' }, 503);
  }
  return c.json(result);
});

async function tokenMatches(candidate: string, expected: string): Promise<boolean> {
  // Web Crypto verification performs the MAC comparison in constant time and
  // works in Workers without enabling Node compatibility.
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(expected), { name: 'HMAC', hash: 'SHA-256' }, false,
    ['sign', 'verify'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(expected));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(candidate));
}

export default stats;
