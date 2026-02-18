import { Hono } from 'hono';
import type { Env, Upload } from '../types.js';
import { TIER_LIMITS } from '../types.js';

const user = new Hono<{ Bindings: Env }>();

/**
 * GET /me — Return current user's profile.
 */
user.get('/me', async (c) => {
  const currentUser = c.get('user');
  if (!currentUser) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Get upload stats
  const stats = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total_uploads,
      COALESCE(SUM(size_bytes), 0) as total_bytes
    FROM uploads
    WHERE user_id = ? AND deleted_at IS NULL
  `).bind(currentUser.id).first<{ total_uploads: number; total_bytes: number }>();

  const limits = TIER_LIMITS[currentUser.tier];

  return c.json({
    id: currentUser.id,
    username: currentUser.github_username,
    email: currentUser.email,
    tier: currentUser.tier,
    created_at: currentUser.created_at,
    stats: {
      total_uploads: stats?.total_uploads || 0,
      total_bytes: stats?.total_bytes || 0,
    },
    limits: {
      maxFileSize: limits.maxFileSize,
      maxTotalStorage: limits.maxTotalStorage,
      maxExpiryHours: limits.maxExpiryHours,
      imageOnly: limits.imageOnly,
      customTtl: limits.customTtl,
      rateLimit: limits.rateLimit,
    },
  });
});

/**
 * GET /uploads — List the authenticated user's uploads.
 * Query params:
 *   - limit: max results (default 50, max 100)
 *   - offset: pagination offset (default 0)
 *   - active: if "true", only show non-expired (default "true")
 */
user.get('/uploads', async (c) => {
  const currentUser = c.get('user');
  if (!currentUser) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');
  const activeOnly = c.req.query('active') !== 'false';

  let query = `
    SELECT id, filename, content_type, size_bytes, expires_at, created_at, deleted_at
    FROM uploads
    WHERE user_id = ?
  `;
  if (activeOnly) {
    query += ` AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))`;
  }
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;

  const result = await c.env.DB.prepare(query)
    .bind(currentUser.id, limit, offset)
    .all<Upload>();

  const uploads = (result.results || []).map(u => ({
    id: u.id,
    filename: u.filename,
    content_type: u.content_type,
    size_bytes: u.size_bytes,
    url: `${c.env.BASE_URL}/f/${u.id}`,
    expires_at: u.expires_at,
    created_at: u.created_at,
    expired: u.expires_at ? new Date(u.expires_at) < new Date() : false,
    deleted: u.deleted_at !== null,
  }));

  return c.json({ uploads, limit, offset });
});

export default user;
