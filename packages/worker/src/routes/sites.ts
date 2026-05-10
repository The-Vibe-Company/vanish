import { Hono } from 'hono';
import type { Context } from 'hono';
import { customAlphabet, nanoid } from 'nanoid';
import type { Env, Site, SiteFile, Tier } from '../types.js';
import { BLOCKED_EXTENSIONS, TIER_LIMITS } from '../types.js';
import { calculateExpiry, isExpired } from '../lib/expiry.js';
import { guessContentType } from '../lib/content-type.js';
import { ensureStorageAvailable } from '../lib/storage.js';
import { normalizeSitePath, normalizeSiteSlug } from '../lib/site-path.js';
import { buildSiteUrl, getSiteIdentifierFromHost, supportsPathSiteUrls } from '../lib/site-url.js';
import { getRateLimitIdentifier } from '../lib/rate-limit.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';

const SITE_ID = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);
const SITE_TOKEN_PREFIX = 'vnst_';

const sites = new Hono<{ Bindings: Env }>();
type AppContext = Context<{ Bindings: Env }>;

interface CreateSiteRequest {
  name?: string;
  rootPath?: string;
  fileCount?: number;
  totalBytes?: number;
  slug?: string;
  days?: number;
}

sites.use('*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return next();
  }

  const identifier = getSiteIdentifierFromHost(c.env.BASE_URL, c.req.header('Host') || null);
  if (!identifier) {
    return next();
  }

  return serveSite(c, identifier, new URL(c.req.url).pathname);
});

sites.post('/sites', rateLimitMiddleware, async (c) => {
  const tier = c.get('tier');
  const user = c.get('user');
  const limits = TIER_LIMITS[tier];
  const payload = await readJson<CreateSiteRequest>(c.req.raw);

  if (!payload) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const rootPath = payload.rootPath ? normalizeSitePath(payload.rootPath) : null;
  if (!rootPath) {
    return c.json({ error: 'rootPath is required and must be a relative file path inside the site folder' }, 400);
  }

  const totalBytes = parsePositiveInteger(payload.totalBytes);
  if (totalBytes === null) {
    return c.json({ error: 'totalBytes is required and must be a positive integer' }, 400);
  }

  const plannedFileCount = parsePositiveInteger(payload.fileCount);
  if (plannedFileCount === null) {
    return c.json({ error: 'fileCount is required and must be a positive integer' }, 400);
  }
  if (plannedFileCount > limits.maxSiteFiles) {
    return c.json({
      error: `Too many files. Max ${limits.maxSiteFiles} files for ${tier} tier.`,
      maxFiles: limits.maxSiteFiles,
    }, 413);
  }

  let customDays: number | undefined;
  if (payload.days !== undefined) {
    customDays = parsePositiveInteger(payload.days) ?? undefined;
    if (!customDays) {
      return c.json({ error: 'days must be a positive integer' }, 400);
    }
    if (!limits.customTtl) {
      return c.json({
        error: `Custom TTL is only available for Pro tier. Current tier: ${tier}.`,
        hint: user ? 'Upgrade with: vanish upgrade' : 'Login and upgrade with: vanish login && vanish upgrade',
      }, 403);
    }
    if (customDays > TIER_LIMITS.pro.maxCustomExpiryDays) {
      return c.json({
        error: `Maximum custom TTL is ${TIER_LIMITS.pro.maxCustomExpiryDays} days.`,
      }, 400);
    }
  }

  let slug: string | null = null;
  if (payload.slug) {
    if (tier !== 'pro' || !user) {
      return c.json({ error: 'Custom vanish.sh slugs are only available for Pro accounts' }, 403);
    }

    slug = normalizeSiteSlug(payload.slug);
    if (!slug) {
      return c.json({
        error: 'Invalid slug. Use 1-63 lowercase letters, numbers, or hyphens, and avoid reserved names.',
      }, 400);
    }

    const existing = await c.env.DB.prepare(`
      SELECT id FROM sites WHERE slug = ? AND deleted_at IS NULL LIMIT 1
    `).bind(slug).first<{ id: string }>();
    if (existing) {
      return c.json({ error: `Slug "${slug}" is already taken` }, 409);
    }
  }

  const quota = await ensureStorageAvailable(c.env, tier, user?.id || null, totalBytes);
  if (!quota.ok) {
    return c.json(quota, 413);
  }

  const id = SITE_ID();
  const uploadToken = SITE_TOKEN_PREFIX + nanoid(32);
  const expiresAt = calculateExpiry(tier, customDays);
  const name = sanitizeSiteName(payload.name || id);

  await c.env.DB.prepare(`
    INSERT INTO sites (id, user_id, name, root_path, slug, upload_token, size_bytes, file_count, expected_file_count, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `).bind(id, user?.id || null, name, rootPath, slug, uploadToken, plannedFileCount, expiresAt).run();

  const identifier = slug || id;

  return c.json({
    id,
    token: uploadToken,
    url: buildSiteUrl(c.env.BASE_URL, identifier),
    name,
    rootPath,
    slug,
    fileCount: plannedFileCount,
    maxFiles: limits.maxSiteFiles,
    maxBytes: tier === 'anonymous' ? TIER_LIMITS.anonymous.maxSiteSize : limits.maxTotalStorage,
    expires: expiresAt,
  }, 201);
});

sites.put('/sites/:id/files', async (c) => {
  const site = await getSite(c.env, c.req.param('id'));
  if (!site) {
    return c.json({ error: 'Site not found' }, 404);
  }

  if (site.published_at) {
    return c.json({ error: 'Published sites cannot be modified' }, 409);
  }

  if (isExpired(site.expires_at)) {
    await deleteSiteObjectsAndMarkDeleted(c.env, site.id);
    return c.json({ error: 'This site has expired' }, 410);
  }

  const auth = authorizeSiteMutation(c, site);
  if (!auth.ok) {
    return c.json({ error: auth.error }, auth.status);
  }

  const rateLimit = await checkSiteMutationRateLimit(c, auth.tier, 'site-file', TIER_LIMITS[auth.tier].maxSiteFiles + TIER_LIMITS[auth.tier].rateLimit);
  if (!rateLimit.ok) {
    return c.json(rateLimit.body, 429);
  }

  const path = c.req.query('path') ? normalizeSitePath(c.req.query('path') || '') : null;
  if (!path) {
    return c.json({ error: 'path query parameter is required and must be a relative file path' }, 400);
  }

  const ext = getExtension(path);
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return c.json({ error: `File type ${ext} is not allowed in sites` }, 400);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) {
    return c.json({ error: 'Empty file' }, 400);
  }

  const existingFile = await c.env.DB.prepare(`
    SELECT size_bytes FROM site_files WHERE site_id = ? AND path = ?
  `).bind(site.id, path).first<{ size_bytes: number }>();

  if (!existingFile && site.file_count >= site.expected_file_count) {
    return c.json({
      error: `Too many files. This site was created for ${site.expected_file_count} files.`,
      maxFiles: site.expected_file_count,
    }, 413);
  }

  const nextSiteSize = site.size_bytes - (existingFile?.size_bytes || 0) + body.byteLength;
  const quota = await ensureStorageAvailable(c.env, auth.tier, auth.userId, nextSiteSize, {
    excludeSiteId: site.id,
  });
  if (!quota.ok) {
    return c.json(quota, 413);
  }

  const contentType = c.req.header('Content-Type') === 'application/octet-stream'
    ? guessContentType(path)
    : c.req.header('Content-Type') || guessContentType(path);
  const r2Key = `sites/${site.id}/${path}`;

  await c.env.BUCKET.put(r2Key, body, {
    httpMetadata: { contentType },
    customMetadata: {
      siteId: site.id,
      path,
      uploadedBy: auth.userId || 'anonymous',
    },
  });

  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT OR REPLACE INTO site_files (site_id, path, content_type, size_bytes, r2_key)
      VALUES (?, ?, ?, ?, ?)
    `).bind(site.id, path, contentType, body.byteLength, r2Key),
    c.env.DB.prepare(`
      UPDATE sites
      SET size_bytes = (
        SELECT COALESCE(SUM(size_bytes), 0) FROM site_files WHERE site_id = ?
      ),
      file_count = (
        SELECT COUNT(*) FROM site_files WHERE site_id = ?
      )
      WHERE id = ?
    `).bind(site.id, site.id, site.id),
  ]);

  return c.json({
    ok: true,
    path,
    size: body.byteLength,
    contentType,
  });
});

sites.post('/sites/:id/publish', async (c) => {
  const site = await getSite(c.env, c.req.param('id'));
  if (!site) {
    return c.json({ error: 'Site not found' }, 404);
  }

  if (isExpired(site.expires_at)) {
    await deleteSiteObjectsAndMarkDeleted(c.env, site.id);
    return c.json({ error: 'This site has expired' }, 410);
  }

  const auth = authorizeSiteMutation(c, site);
  if (!auth.ok) {
    return c.json({ error: auth.error }, auth.status);
  }

  const rateLimit = await checkSiteMutationRateLimit(c, auth.tier, 'site-publish', TIER_LIMITS[auth.tier].rateLimit);
  if (!rateLimit.ok) {
    return c.json(rateLimit.body, 429);
  }

  const root = await c.env.DB.prepare(`
    SELECT path FROM site_files WHERE site_id = ? AND path = ?
  `).bind(site.id, site.root_path).first<{ path: string }>();

  if (!root) {
    return c.json({ error: `Root file not uploaded: ${site.root_path}` }, 400);
  }

  const freshSite = await getSite(c.env, site.id);
  if (!freshSite || freshSite.file_count === 0) {
    return c.json({ error: 'No site files uploaded' }, 400);
  }
  if (freshSite.file_count !== freshSite.expected_file_count) {
    return c.json({
      error: `Site is incomplete. Uploaded ${freshSite.file_count} of ${freshSite.expected_file_count} declared files.`,
    }, 400);
  }

  const quota = await ensureStorageAvailable(c.env, auth.tier, auth.userId, freshSite.size_bytes, {
    excludeSiteId: site.id,
  });
  if (!quota.ok) {
    return c.json(quota, 413);
  }

  const publishedAt = freshSite.published_at || new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE sites
    SET published_at = ?, upload_token = NULL
    WHERE id = ?
  `).bind(publishedAt, site.id).run();

  const identifier = freshSite.slug || freshSite.id;
  return c.json({
    ok: true,
    id: freshSite.id,
    url: buildSiteUrl(c.env.BASE_URL, identifier),
    rootPath: freshSite.root_path,
    size: freshSite.size_bytes,
    fileCount: freshSite.file_count,
    expectedFileCount: freshSite.expected_file_count,
    expires: freshSite.expires_at,
  });
});

sites.get('/sites', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const activeOnly = c.req.query('active') !== 'false';

  let query = `
    SELECT id, user_id, name, root_path, slug, upload_token, size_bytes, file_count, expected_file_count,
           expires_at, published_at, created_at, deleted_at
    FROM sites
    WHERE user_id = ?
  `;
  if (activeOnly) {
    query += ` AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))`;
  }
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;

  const result = await c.env.DB.prepare(query).bind(user.id, limit, offset).all<Site>();
  const listedSites = (result.results || []).map(siteToJson(c.env.BASE_URL));

  return c.json({ sites: listedSites, limit, offset });
});

sites.delete('/sites/:id', async (c) => {
  const user = c.get('user');
  const site = await getSite(c.env, c.req.param('id'));
  if (!site) {
    return c.json({ error: 'Site not found' }, 404);
  }

  const token = c.req.header('X-Site-Token');
  const tokenCanDeleteDraft = !site.published_at && site.upload_token && token === site.upload_token;

  if (site.user_id && !user && !tokenCanDeleteDraft) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  if (site.user_id !== user?.id && !tokenCanDeleteDraft) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  await deleteSiteObjectsAndMarkDeleted(c.env, site.id);

  return c.json({ ok: true });
});

sites.get('/s/:sitePath{.+}', async (c) => {
  if (!supportsPathSiteUrls(c.env.BASE_URL)) {
    return c.json({ error: 'Not found' }, 404);
  }

  const [identifier, ...pathParts] = c.req.param('sitePath').split('/');
  return serveSite(c, identifier, pathParts.length > 0 ? '/' + pathParts.join('/') : '/');
});

async function serveSite(c: AppContext, identifier: string, pathname: string): Promise<Response> {
  const site = await c.env.DB.prepare(`
    SELECT id, user_id, name, root_path, slug, upload_token, size_bytes, file_count, expected_file_count,
           expires_at, published_at, created_at, deleted_at
    FROM sites
    WHERE (id = ? OR slug = ?)
      AND deleted_at IS NULL
      AND published_at IS NOT NULL
    LIMIT 1
  `).bind(identifier, identifier).first<Site>();

  if (!site) {
    return c.json({ error: 'Site not found' }, 404);
  }

  if (isExpired(site.expires_at)) {
    c.executionCtx.waitUntil(deleteSiteObjectsAndMarkDeleted(c.env, site.id));
    return c.json({ error: 'This site has expired' }, 410);
  }

  const path = pathname === '/'
    ? site.root_path
    : normalizeSitePath(safeDecode(pathname.replace(/^\/+/, '')));

  if (!path) {
    return c.json({ error: 'File not found' }, 404);
  }

  const file = await c.env.DB.prepare(`
    SELECT site_id, path, content_type, size_bytes, r2_key, created_at
    FROM site_files
    WHERE site_id = ? AND path = ?
  `).bind(site.id, path).first<SiteFile>();

  if (!file) {
    return c.json({ error: 'File not found' }, 404);
  }

  const object = await c.env.BUCKET.get(file.r2_key);
  if (!object) {
    return c.json({ error: 'File not found' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', file.content_type || guessContentType(file.path));
  headers.set('Content-Length', String(file.size_bytes));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cache-Control', 'public, max-age=300');
  headers.set('Content-Disposition', `inline; filename="${escapeHeaderFilename(file.path.split('/').pop() || 'index')}"`);
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(object.body, { headers });
}

function authorizeSiteMutation(
  c: AppContext,
  site: Site,
): { ok: true; tier: Tier; userId: string | null } | { ok: false; error: string; status: 401 | 403 } {
  const user = c.get('user');

  if (site.user_id) {
    if (!user) {
      return { ok: false, error: 'Authentication required', status: 401 };
    }
    if (user.id !== site.user_id) {
      return { ok: false, error: 'Not authorized', status: 403 };
    }
    return { ok: true, tier: user.tier, userId: user.id };
  }

  const token = c.req.header('X-Site-Token');
  if (!site.upload_token || token !== site.upload_token) {
    return { ok: false, error: 'Site token required', status: 401 };
  }

  return { ok: true, tier: 'anonymous', userId: null };
}

async function checkSiteMutationRateLimit(
  c: AppContext,
  tier: Tier,
  action: string,
  limit: number,
): Promise<{ ok: true } | { ok: false; body: { error: string; limit: number; window: string; tier: Tier } }> {
  const identifier = getRateLimitIdentifier(
    c.get('user'),
    c.req.header('CF-Connecting-IP') || null,
    c.req.header('X-Forwarded-For') || null,
  );

  const result = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM rate_limits
    WHERE identifier = ? AND action = ? AND created_at > datetime('now', '-1 hour')
  `).bind(identifier, action).first<{ count: number }>();

  const count = result?.count ?? 0;
  if (count >= limit) {
    return {
      ok: false,
      body: {
        error: 'Rate limit exceeded',
        limit,
        window: '1 hour',
        tier,
      },
    };
  }

  await c.env.DB.prepare(`
    INSERT INTO rate_limits (identifier, action) VALUES (?, ?)
  `).bind(identifier, action).run();

  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(limit - count - 1));
  return { ok: true };
}

function siteToJson(baseUrl: string) {
  return (site: Site) => {
    const identifier = site.slug || site.id;
    return {
      id: site.id,
      name: site.name,
      root_path: site.root_path,
      slug: site.slug,
      size_bytes: site.size_bytes,
      file_count: site.file_count,
      expected_file_count: site.expected_file_count,
      url: buildSiteUrl(baseUrl, identifier),
      expires_at: site.expires_at,
      created_at: site.created_at,
      published_at: site.published_at,
      expired: site.expires_at ? new Date(site.expires_at) < new Date() : false,
      deleted: site.deleted_at !== null,
    };
  };
}

async function getSite(env: Env, id: string): Promise<Site | null> {
  return env.DB.prepare(`
    SELECT id, user_id, name, root_path, slug, upload_token, size_bytes, file_count, expected_file_count,
           expires_at, published_at, created_at, deleted_at
    FROM sites
    WHERE id = ? AND deleted_at IS NULL
  `).bind(id).first<Site>();
}

async function markSiteDeleted(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE sites SET deleted_at = datetime('now') WHERE id = ?
  `).bind(id).run();
}

async function deleteSiteObjectsAndMarkDeleted(env: Env, id: string): Promise<void> {
  while (true) {
    const files = await env.DB.prepare(`
      SELECT r2_key FROM site_files WHERE site_id = ? LIMIT 100
    `).bind(id).all<{ r2_key: string }>();

    const keys = files.results || [];
    if (keys.length === 0) {
      break;
    }

    await Promise.all(keys.map(file => env.BUCKET.delete(file.r2_key)));

    const placeholders = keys.map(() => '?').join(',');
    await env.DB.prepare(`
      DELETE FROM site_files WHERE site_id = ? AND r2_key IN (${placeholders})
    `).bind(id, ...keys.map(file => file.r2_key)).run();
  }

  await markSiteDeleted(env, id);
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function sanitizeSiteName(value: string): string {
  const name = value.trim();
  if (!name) return 'site';
  return name.slice(0, 120);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getExtension(path: string): string {
  const filename = path.split('/').pop() || '';
  return filename.includes('.') ? '.' + filename.split('.').pop()!.toLowerCase() : '';
}

function escapeHeaderFilename(filename: string): string {
  return filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export default sites;
