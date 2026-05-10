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

  // Get active file and site stats.
  const uploadStats = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total_uploads,
      COALESCE(SUM(size_bytes), 0) as total_bytes
    FROM uploads
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).bind(currentUser.id).first<{ total_uploads: number; total_bytes: number }>();

  const siteStats = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total_sites,
      COALESCE(SUM(size_bytes), 0) as total_bytes
    FROM sites
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).bind(currentUser.id).first<{ total_sites: number; total_bytes: number }>();

  let bundleStats: { total_bundles: number; total_bytes: number } | null = null;
  try {
    bundleStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_bundles,
        COALESCE(SUM(size_bytes), 0) as total_bytes
      FROM bundles
      WHERE user_id = ?
        AND deleted_at IS NULL
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).bind(currentUser.id).first<{ total_bundles: number; total_bytes: number }>();
  } catch {
    bundleStats = null;
  }

  const limits = TIER_LIMITS[currentUser.tier];
  const uploadBytes = uploadStats?.total_bytes || 0;
  const siteBytes = siteStats?.total_bytes || 0;
  const bundleBytes = bundleStats?.total_bytes || 0;

  return c.json({
    id: currentUser.id,
    username: currentUser.github_username,
    email: currentUser.email,
    tier: currentUser.tier,
    created_at: currentUser.created_at,
    stats: {
      total_uploads: uploadStats?.total_uploads || 0,
      total_sites: siteStats?.total_sites || 0,
      total_bundles: bundleStats?.total_bundles || 0,
      upload_bytes: uploadBytes,
      site_bytes: siteBytes,
      bundle_bytes: bundleBytes,
      total_bytes: uploadBytes + siteBytes + bundleBytes,
    },
    limits: {
      maxFileSize: limits.maxFileSize,
      maxSiteSize: limits.maxSiteSize,
      maxSiteFiles: limits.maxSiteFiles,
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
