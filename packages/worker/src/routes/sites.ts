import { Hono } from 'hono';
import type { Context } from 'hono';
import { customAlphabet, nanoid } from 'nanoid';
import type { Env, Site, SiteFile, Tier } from '../types.js';
import { BLOCKED_EXTENSIONS, TIER_LIMITS, isPaidTier } from '../types.js';
import { calculateExpiry, isExpired } from '../lib/expiry.js';
import { guessContentType } from '../lib/content-type.js';
import { ensureStorageAvailable } from '../lib/storage.js';
import { normalizeSitePath, normalizeSiteSlug } from '../lib/site-path.js';
import { buildSiteUrl, getSiteIdentifierFromHost, supportsPathSiteUrls } from '../lib/site-url.js';
import { getRateLimitIdentifier } from '../lib/rate-limit.js';
import { hasProductEvent, logProductEvent, productEventsEnabled } from '../lib/events.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import {
  getIdempotencyKey,
  getIdempotencyOwner,
  getIdempotentReplay,
  clearIdempotencyReservation,
  reserveIdempotencyKey,
  structuredError,
} from '../lib/api-response.js';

const SITE_ID = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);
const SLUG_SUFFIX = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 2);
const SITE_TOKEN_PREFIX = 'vnst_';
const REPLACEMENT_NAME_PREFIX = '__replace__:';
const SLUG_ADJECTIVES = [
  'amber', 'brave', 'calm', 'clear', 'cosmic', 'crisp', 'daring', 'dusky',
  'fuzzy', 'gentle', 'golden', 'happy', 'hidden', 'lively', 'lucky', 'mellow',
  'neon', 'nimble', 'quiet', 'rapid', 'silver', 'solar', 'tiny', 'velvet',
];
const SLUG_NOUNS = [
  'atlas', 'brook', 'canyon', 'comet', 'delta', 'ember', 'field', 'forest',
  'harbor', 'island', 'lagoon', 'meadow', 'nova', 'orbit', 'pixel', 'river',
  'signal', 'spark', 'stone', 'summit', 'tempo', 'valley', 'wave', 'willow',
];

const sites = new Hono<{ Bindings: Env }>();
type AppContext = Context<{ Bindings: Env }>;

interface CreateSiteRequest {
  name?: string;
  rootPath?: string;
  fileCount?: number;
  totalBytes?: number;
  slug?: string;
  days?: number;
  channel?: string;
}

interface PatchSiteRequest {
  rootPath?: string;
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
  const idempotencyKey = getIdempotencyKey(c.req.raw);
  const idempotencyOwner = getIdempotencyOwner(
    user,
    c.req.header('CF-Connecting-IP') || null,
    c.req.header('X-Forwarded-For') || null,
  );

  if ((c.req.header('Idempotency-Key') || c.req.header('X-Idempotency-Key')) && !idempotencyKey) {
    return c.json(structuredError('invalid_idempotency_key', 'Invalid idempotency key', 400), 400);
  }

  if (idempotencyKey) {
    const replay = await getIdempotentReplay(c.env, 'site-create', idempotencyOwner, idempotencyKey);
    if (replay) {
      return c.json(replay.body, replay.status as 201);
    }
  }

  const payload = await readJson<CreateSiteRequest>(c.req.raw);

  if (!payload) {
    return c.json(structuredError('invalid_json', 'Invalid JSON body', 400), 400);
  }

  const rootPath = payload.rootPath ? normalizeSitePath(payload.rootPath) : null;
  if (!rootPath) {
    return c.json(structuredError('invalid_root_path', 'rootPath is required and must be a relative file path inside the site folder', 400), 400);
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
        error: `Custom TTL is only available on paid plans. Current tier: ${tier}.`,
        hint: user ? 'Upgrade with: vanish upgrade' : 'Login and upgrade with: vanish login && vanish upgrade',
      }, 403);
    }
    if (customDays > limits.maxCustomExpiryDays) {
      return c.json({
        error: `Maximum custom TTL is ${limits.maxCustomExpiryDays} days.`,
      }, 400);
    }
  }

  let slug: string | null;
  if (payload.slug) {
    if (!isPaidTier(tier) || !user) {
      return c.json({ error: 'Custom vanish.sh slugs are only available on paid plans' }, 403);
    }

    slug = await validateSiteSlug(c.env, payload.slug);
    if (!slug) {
      return c.json({
        error: 'Invalid slug. Use 1-63 lowercase letters, numbers, or hyphens, and avoid reserved names.',
      }, 400);
    }
  } else {
    slug = await generateReadableSlug(c.env);
  }

  const existing = await getSlugConflict(c.env, slug);
  if (existing) {
    return c.json({ error: `Slug "${slug}" is already taken` }, 409);
  }

  let channel: string | null = null;
  if (payload.channel !== undefined) {
    if (!user) {
      return c.json(structuredError(
        'channel_requires_auth',
        'Channels require login because they update an owned URL.',
        401,
        { hint: 'Run: vanish login' },
      ), 401);
    }

    channel = normalizeChannel(payload.channel);
    if (!channel) {
      return c.json(structuredError('invalid_channel', 'Invalid channel. Use 1-80 letters, numbers, dots, underscores, or hyphens.', 400), 400);
    }

    const existingChannelSite = await getSiteByChannel(c.env, user.id, channel);
    if (existingChannelSite) {
      return c.json({
        ...structuredError('channel_already_exists', `Channel "${channel}" already points at a site. Update it instead.`, 409),
        site: siteToJson(c.env.BASE_URL)(existingChannelSite),
      }, 409);
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
  const identifier = slug || id;
  const result = {
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
    ...(channel ? { channel } : {}),
  };

  if (idempotencyKey) {
    const reservation = await reserveIdempotencyKey(c.env, 'site-create', idempotencyOwner, idempotencyKey);
    if (!reservation.ok) {
      return c.json(reservation.body, reservation.status as 201 | 409);
    }
  }

  try {
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(`
        INSERT INTO sites (id, user_id, name, root_path, slug, upload_token, size_bytes, file_count, expected_file_count, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      `).bind(id, user?.id || null, name, rootPath, slug, uploadToken, plannedFileCount, expiresAt),
    ];

    if (user && channel) {
      statements.push(c.env.DB.prepare(`
        INSERT OR REPLACE INTO site_channels (user_id, channel, site_id, updated_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(user.id, channel, id));
    }

    if (idempotencyKey) {
      statements.push(c.env.DB.prepare(`
        UPDATE idempotency_keys
        SET status = ?,
            response_json = ?,
            expires_at = datetime('now', '+48 hours')
        WHERE scope = ?
          AND owner = ?
          AND idempotency_key = ?
          AND status = 409
      `).bind(201, JSON.stringify(result), 'site-create', idempotencyOwner, idempotencyKey));
    }

    await c.env.DB.batch(statements);
  } catch (err) {
    if (idempotencyKey) {
      await clearIdempotencyReservation(c.env, 'site-create', idempotencyOwner, idempotencyKey).catch(clearErr => {
        console.error('Failed to clear site create idempotency reservation:', clearErr);
      });
    }
    throw err;
  }

  await logProductEvent(c.env, {
    name: 'site_publish_started',
    userId: user?.id || null,
    siteId: id,
    properties: {
      tier,
      file_count: plannedFileCount,
      total_bytes: totalBytes,
      max_bytes: tier === 'anonymous' ? TIER_LIMITS.anonymous.maxSiteSize : limits.maxTotalStorage,
      slug_requested: Boolean(payload.slug),
      custom_ttl_requested: customDays !== undefined,
    },
  });

  return c.json(result, 201);
});

sites.patch('/sites/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const site = await getSiteByIdentifier(c.env, c.req.param('id'));
  if (!site) {
    return c.json({ error: 'Site not found' }, 404);
  }
  if (site.user_id !== user.id) {
    return c.json({ error: 'Not authorized' }, 403);
  }
  if (isExpired(site.expires_at)) {
    await deleteSiteObjectsAndMarkDeleted(c.env, site.id);
    return c.json({ error: 'This site has expired' }, 410);
  }

  const payload = await readJson<PatchSiteRequest>(c.req.raw);
  if (!payload) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const patch = await validateSiteConfigPatch(c, site, payload);
  if (!patch.ok) {
    return c.json({ error: patch.error }, patch.status);
  }

  await c.env.DB.prepare(`
    UPDATE sites
    SET root_path = ?, slug = ?, expires_at = ?
    WHERE id = ?
  `).bind(patch.rootPath, patch.slug, patch.expiresAt, site.id).run();

  const updated = await getSite(c.env, site.id);
  return c.json(siteToJson(c.env.BASE_URL)(updated || site));
});

sites.post('/sites/:id/replacements', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const target = await getSiteByIdentifier(c.env, c.req.param('id'));
  if (!target) {
    return c.json({ error: 'Site not found' }, 404);
  }
  if (target.user_id !== user.id) {
    return c.json({ error: 'Not authorized' }, 403);
  }
  if (!target.published_at) {
    return c.json({ error: 'Only published sites can be updated' }, 409);
  }
  if (isExpired(target.expires_at)) {
    await deleteSiteObjectsAndMarkDeleted(c.env, target.id);
    return c.json({ error: 'This site has expired' }, 410);
  }

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

  const limits = TIER_LIMITS[user.tier];
  if (plannedFileCount > limits.maxSiteFiles) {
    return c.json({
      error: `Too many files. Max ${limits.maxSiteFiles} files for ${user.tier} tier.`,
      maxFiles: limits.maxSiteFiles,
    }, 413);
  }

  if ((payload.slug || payload.days !== undefined) && !isPaidTier(user.tier)) {
    return c.json({
      error: `${payload.slug ? 'Custom vanish.sh slugs' : 'Custom TTL'} are only available on paid plans`,
    }, 403);
  }

  const quota = await ensureStorageAvailable(c.env, user.tier, user.id, totalBytes, {
    excludeSiteId: target.id,
  });
  if (!quota.ok) {
    return c.json(quota, 413);
  }

  const id = SITE_ID();
  const uploadToken = SITE_TOKEN_PREFIX + nanoid(32);
  const name = `${REPLACEMENT_NAME_PREFIX}${target.id}:${sanitizeSiteName(payload.name || target.name)}`;

  await c.env.DB.prepare(`
    INSERT INTO sites (id, user_id, name, root_path, slug, upload_token, size_bytes, file_count, expected_file_count, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `).bind(id, user.id, name, rootPath, null, uploadToken, plannedFileCount, target.expires_at).run();

  await logProductEvent(c.env, {
    name: 'site_publish_started',
    userId: user.id,
    siteId: id,
    properties: {
      tier: user.tier,
      file_count: plannedFileCount,
      total_bytes: totalBytes,
      max_bytes: limits.maxTotalStorage,
      is_update: true,
      slug_requested: Boolean(payload.slug),
      custom_ttl_requested: payload.days !== undefined,
    },
  });

  return c.json({
    id,
    token: uploadToken,
    targetId: target.id,
    rootPath,
    fileCount: plannedFileCount,
    maxFiles: limits.maxSiteFiles,
    maxBytes: limits.maxTotalStorage,
    expires: target.expires_at,
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

  await touchSiteDraft(c.env, site.id);

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
  await touchSiteDraft(c.env, site.id);

  const existingFile = await c.env.DB.prepare(`
    SELECT size_bytes, r2_key FROM site_files WHERE site_id = ? AND path = ?
  `).bind(site.id, path).first<{ size_bytes: number; r2_key: string }>();

  if (!existingFile && site.file_count >= site.expected_file_count) {
    return c.json({
      error: `Too many files. This site was created for ${site.expected_file_count} files.`,
      maxFiles: site.expected_file_count,
    }, 413);
  }

  const replacementTargetId = getReplacementTargetId(site);
  const nextSiteSize = site.size_bytes - (existingFile?.size_bytes || 0) + body.byteLength;
  const quota = await ensureStorageAvailable(c.env, auth.tier, auth.userId, nextSiteSize, {
    excludeSiteIds: [site.id, ...(replacementTargetId ? [replacementTargetId] : [])],
  });
  if (!quota.ok) {
    return c.json(quota, 413);
  }

  const contentType = c.req.header('Content-Type') === 'application/octet-stream'
    ? guessContentType(path)
    : c.req.header('Content-Type') || guessContentType(path);
  const r2Key = `sites/${site.id}/objects/${nanoid(24)}`;

  await c.env.BUCKET.put(r2Key, body, {
    httpMetadata: { contentType },
    customMetadata: {
      siteId: site.id,
      path,
      uploadedBy: auth.userId || 'anonymous',
    },
  });

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT OR IGNORE INTO pending_r2_deletions (r2_key)
        SELECT ?
        WHERE ? IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM sites WHERE id = ? AND deleted_at IS NULL AND published_at IS NULL
          )
      `).bind(existingFile?.r2_key || null, existingFile?.r2_key || null, site.id),
      c.env.DB.prepare(`
        INSERT OR REPLACE INTO site_files (site_id, path, content_type, size_bytes, r2_key)
        SELECT ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM sites WHERE id = ? AND deleted_at IS NULL AND published_at IS NULL
        )
      `).bind(site.id, path, contentType, body.byteLength, r2Key, site.id),
      c.env.DB.prepare(`
        UPDATE sites
        SET size_bytes = (
          SELECT COALESCE(SUM(size_bytes), 0) FROM site_files WHERE site_id = ?
        ),
        file_count = (
          SELECT COUNT(*) FROM site_files WHERE site_id = ?
        ),
        last_activity_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL AND published_at IS NULL
      `).bind(site.id, site.id, site.id),
    ]);
  } catch (err) {
    await queueAndDeleteR2Object(c.env, r2Key);
    throw err;
  }

  const committedFile = await c.env.DB.prepare(`
    SELECT r2_key FROM site_files WHERE site_id = ? AND path = ?
  `).bind(site.id, path).first<{ r2_key: string }>();
  if (committedFile?.r2_key !== r2Key) {
    await queueAndDeleteR2Object(c.env, r2Key);
    const currentSite = await getSite(c.env, site.id);
    return currentSite
      ? c.json({ error: 'This site draft was published before the upload completed' }, 409)
      : c.json({ error: 'This site draft is no longer available' }, 410);
  }

  if (existingFile?.r2_key && existingFile.r2_key !== r2Key) {
    await deletePendingR2Objects(c.env, [existingFile.r2_key]);
  }

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

  await touchSiteDraft(c.env, site.id);

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

  await logSitePublished(c, freshSite, auth, false);

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

sites.post('/sites/:id/replacements/:draftId/publish', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const target = await getSiteByIdentifier(c.env, c.req.param('id'));
  if (!target) {
    return c.json({ error: 'Site not found' }, 404);
  }
  if (target.user_id !== user.id) {
    return c.json({ error: 'Not authorized' }, 403);
  }
  if (isExpired(target.expires_at)) {
    await deleteSiteObjectsAndMarkDeleted(c.env, target.id);
    return c.json({ error: 'This site has expired' }, 410);
  }

  const draft = await getSite(c.env, c.req.param('draftId'));
  if (!draft || draft.user_id !== user.id || getReplacementTargetId(draft) !== target.id) {
    return c.json({ error: 'Replacement draft not found' }, 404);
  }

  await touchSiteDraft(c.env, draft.id);
  if (draft.published_at) {
    return c.json({ error: 'Replacement draft has already been published' }, 409);
  }
  if (c.req.header('X-Site-Token') !== draft.upload_token) {
    return c.json({ error: 'Site token required' }, 401);
  }

  const payload = await readJson<PatchSiteRequest>(c.req.raw);
  if (!payload) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const root = await c.env.DB.prepare(`
    SELECT path FROM site_files WHERE site_id = ? AND path = ?
  `).bind(draft.id, draft.root_path).first<{ path: string }>();
  if (!root) {
    return c.json({ error: `Root file not uploaded: ${draft.root_path}` }, 400);
  }

  const freshDraft = await getSite(c.env, draft.id);
  if (!freshDraft || freshDraft.file_count === 0) {
    return c.json({ error: 'No site files uploaded' }, 400);
  }
  if (freshDraft.file_count !== freshDraft.expected_file_count) {
    return c.json({
      error: `Site is incomplete. Uploaded ${freshDraft.file_count} of ${freshDraft.expected_file_count} declared files.`,
    }, 400);
  }

  const patch = await validateSiteConfigPatch(c, target, {
    slug: payload.slug,
    days: payload.days,
  });
  if (!patch.ok) {
    return c.json({ error: patch.error }, patch.status);
  }

  const quota = await ensureStorageAvailable(c.env, user.tier, user.id, freshDraft.size_bytes, {
    excludeSiteIds: [target.id, freshDraft.id],
  });
  if (!quota.ok) {
    return c.json(quota, 413);
  }

  const oldFiles = await listSiteObjectKeys(c.env, target.id);
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT OR IGNORE INTO pending_r2_deletions (r2_key)
      SELECT r2_key FROM site_files WHERE site_id = ?
    `).bind(target.id),
    c.env.DB.prepare(`
      INSERT OR REPLACE INTO site_files (site_id, path, content_type, size_bytes, r2_key, created_at)
      SELECT ?, path, content_type, size_bytes, r2_key, created_at
      FROM site_files
      WHERE site_id = ?
    `).bind(target.id, freshDraft.id),
    c.env.DB.prepare(`
      UPDATE sites
      SET name = ?, root_path = ?, slug = ?, size_bytes = ?, file_count = ?, expected_file_count = ?,
          expires_at = ?, upload_token = NULL
      WHERE id = ?
    `).bind(
      stripReplacementName(freshDraft.name),
      freshDraft.root_path,
      patch.slug,
      freshDraft.size_bytes,
      freshDraft.file_count,
      freshDraft.expected_file_count,
      patch.expiresAt,
      target.id,
    ),
    c.env.DB.prepare(`
      DELETE FROM site_files
      WHERE site_id = ?
        AND path NOT IN (
          SELECT path FROM site_files WHERE site_id = ?
        )
    `).bind(target.id, freshDraft.id),
    c.env.DB.prepare('DELETE FROM site_files WHERE site_id = ?').bind(freshDraft.id),
    c.env.DB.prepare(`
      UPDATE sites
      SET upload_token = NULL, size_bytes = 0, file_count = 0, deleted_at = datetime('now')
      WHERE id = ?
    `).bind(freshDraft.id),
  ]);

  await deletePendingR2Objects(c.env, oldFiles);

  const updated = await getSite(c.env, target.id);
  await logSitePublished(c, updated || target, { tier: user.tier, userId: user.id }, true);
  const identifier = updated?.slug || target.id;
  return c.json({
    ok: true,
    id: target.id,
    url: buildSiteUrl(c.env.BASE_URL, identifier),
    rootPath: updated?.root_path || freshDraft.root_path,
    size: updated?.size_bytes || freshDraft.size_bytes,
    fileCount: updated?.file_count || freshDraft.file_count,
    expectedFileCount: updated?.expected_file_count || freshDraft.expected_file_count,
    expires: updated?.expires_at || patch.expiresAt,
  });
});

sites.get('/sites', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const limit = parseBoundedInteger(c.req.query('limit'), 50, 1, 100);
  const offset = parseBoundedInteger(c.req.query('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
  const activeOnly = c.req.query('active') !== 'false';

  let query = `
    SELECT id, user_id, name, root_path, slug, upload_token, size_bytes, file_count, expected_file_count,
           expires_at, published_at, created_at, last_activity_at, deleted_at
    FROM sites
    WHERE user_id = ?
  `;
  if (activeOnly) {
    query += ` AND deleted_at IS NULL AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`;
  }
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;

  const result = await c.env.DB.prepare(query).bind(user.id, limit, offset).all<Site>();
  const listedSites = (result.results || []).map(siteToJson(c.env.BASE_URL));

  return c.json({ sites: listedSites, limit, offset });
});

sites.get('/sites/channels/:channel', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json(structuredError('auth_required', 'Authentication required', 401, { hint: 'Run: vanish login' }), 401);
  }

  const channel = normalizeChannel(c.req.param('channel'));
  if (!channel) {
    return c.json(structuredError('invalid_channel', 'Invalid channel', 400), 400);
  }

  const site = await getSiteByChannel(c.env, user.id, channel);
  if (!site) {
    return c.json(structuredError('channel_not_found', 'Channel not found', 404), 404);
  }

  return c.json({ channel, site: siteToJson(c.env.BASE_URL)(site) });
});

sites.get('/sites/:id/files', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const site = await getSiteByIdentifier(c.env, c.req.param('id'));
  if (!site) {
    return c.json({ error: 'Site not found' }, 404);
  }
  if (site.user_id !== user.id) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const result = await c.env.DB.prepare(`
    SELECT path, content_type, size_bytes, created_at
    FROM site_files
    WHERE site_id = ?
    ORDER BY path ASC
  `).bind(site.id).all<{ path: string; content_type: string | null; size_bytes: number; created_at: string }>();

  return c.json({
    site: siteToJson(c.env.BASE_URL)(site),
    files: result.results || [],
  });
});

sites.get('/sites/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const site = await getSiteByIdentifier(c.env, c.req.param('id'));
  if (!site) {
    return c.json({ error: 'Site not found' }, 404);
  }
  if (site.user_id !== user.id) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  return c.json(siteToJson(c.env.BASE_URL)(site));
});

sites.delete('/sites/:id', async (c) => {
  const user = c.get('user');
  const site = await getSiteByIdentifier(c.env, c.req.param('id'));
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
  if (site.user_id) {
    try {
      await c.env.DB.prepare('DELETE FROM site_channels WHERE site_id = ? AND user_id = ?')
        .bind(site.id, site.user_id).run();
    } catch {
      // Older self-hosted schemas and tests may not have channels yet.
    }
  }

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
  const site = await getPublishedSiteByIdentifier(c.env, identifier);

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
  const contentType = file.content_type || guessContentType(file.path);
  headers.set('Content-Type', contentType);
  headers.set('Content-Length', String(file.size_bytes));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cache-Control', 'public, max-age=300');
  headers.set('Content-Disposition', `inline; filename="${escapeHeaderFilename(file.path.split('/').pop() || 'index')}"`);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Link', '<mailto:abuse@vanish.sh>; rel="abuse"');

  c.executionCtx.waitUntil(logSiteFirstServed(c.env, site));

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

async function logSitePublished(
  c: AppContext,
  site: Site,
  auth: { tier: Tier; userId: string | null },
  isUpdate: boolean,
): Promise<void> {
  await logProductEvent(c.env, {
    name: 'site_publish_succeeded',
    userId: auth.userId,
    siteId: site.id,
    properties: {
      tier: auth.tier,
      file_count: site.file_count,
      total_bytes: site.size_bytes,
      is_update: isUpdate,
    },
  });

  if (isUpdate) {
    await logProductEvent(c.env, {
      name: 'site_update_used',
      userId: auth.userId,
      siteId: site.id,
      properties: {
        tier: auth.tier,
      },
    });
    return;
  }

  if (!auth.userId || !productEventsEnabled(c.env)) {
    return;
  }

  const count = await c.env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM sites
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND published_at IS NOT NULL
  `).bind(auth.userId).first<{ count: number }>();

  if ((count?.count || 0) > 1) {
    await logProductEvent(c.env, {
      name: 'site_repeat_publish',
      userId: auth.userId,
      siteId: site.id,
      properties: {
        tier: auth.tier,
      },
    });
  }
}

async function logSiteFirstServed(env: Env, site: Site): Promise<void> {
  if (!productEventsEnabled(env)) {
    return;
  }

  if (await hasProductEvent(env, 'site_first_served', site.id)) {
    return;
  }

  await logProductEvent(env, {
    name: 'site_first_served',
    userId: site.user_id,
    siteId: site.id,
    properties: {
      tier: site.user_id ? null : 'anonymous',
    },
  });
}

async function validateSiteConfigPatch(
  c: AppContext,
  site: Site,
  payload: PatchSiteRequest,
): Promise<
  | { ok: true; rootPath: string; slug: string | null; expiresAt: string | null }
  | { ok: false; error: string; status: 400 | 403 | 409 }
> {
  const user = c.get('user');
  if (!user) {
    return { ok: false, error: 'Authentication required', status: 403 };
  }
  const limits = TIER_LIMITS[user.tier];

  let rootPath = site.root_path;
  if (payload.rootPath !== undefined) {
    const normalizedRootPath = normalizeSitePath(payload.rootPath);
    if (!normalizedRootPath) {
      return { ok: false, error: 'rootPath must be a relative file path inside the site folder', status: 400 };
    }

    const root = await c.env.DB.prepare(`
      SELECT path FROM site_files WHERE site_id = ? AND path = ?
    `).bind(site.id, normalizedRootPath).first<{ path: string }>();
    if (!root) {
      return { ok: false, error: `Root file not found: ${normalizedRootPath}`, status: 400 };
    }
    rootPath = normalizedRootPath;
  }

  let slug = site.slug;
  if (payload.slug !== undefined) {
    if (!isPaidTier(user.tier)) {
      return { ok: false, error: 'Custom vanish.sh slugs are only available on paid plans', status: 403 };
    }

    const normalizedSlug = await validateSiteSlug(c.env, payload.slug);
    if (!normalizedSlug) {
      return {
        ok: false,
        error: 'Invalid slug. Use 1-63 lowercase letters, numbers, or hyphens, and avoid reserved names.',
        status: 400,
      };
    }

    const existing = await getSlugConflict(c.env, normalizedSlug, site.id);
    if (existing) {
      return { ok: false, error: `Slug "${normalizedSlug}" is already taken`, status: 409 };
    }
    slug = normalizedSlug;
  }

  let expiresAt = site.expires_at;
  if (payload.days !== undefined) {
    const customDays = parsePositiveInteger(payload.days);
    if (!customDays) {
      return { ok: false, error: 'days must be a positive integer', status: 400 };
    }
    if (!limits.customTtl) {
      return { ok: false, error: 'Custom TTL is only available on paid plans', status: 403 };
    }
    if (customDays > limits.maxCustomExpiryDays) {
      return {
        ok: false,
        error: `Maximum custom TTL is ${limits.maxCustomExpiryDays} days.`,
        status: 400,
      };
    }
    expiresAt = calculateExpiry(user.tier, customDays);
  }

  return { ok: true, rootPath, slug, expiresAt };
}

async function generateReadableSlug(env: Env): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const adjective = SLUG_ADJECTIVES[Math.floor(Math.random() * SLUG_ADJECTIVES.length)];
    const noun = SLUG_NOUNS[Math.floor(Math.random() * SLUG_NOUNS.length)];
    const slug = `${adjective}-${noun}-${SLUG_SUFFIX()}`;
    if (normalizeSiteSlug(slug) && !(await getSlugConflict(env, slug))) {
      return slug;
    }
  }

  return `site-${SITE_ID()}`;
}

async function validateSiteSlug(env: Env, input: string): Promise<string | null> {
  const slug = normalizeSiteSlug(input);
  if (!slug) {
    return null;
  }

  return slug;
}

function normalizeChannel(input: string): string | null {
  const channel = input.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,78}[a-z0-9])?$/.test(channel)) {
    return null;
  }

  return channel;
}

async function getSiteByChannel(env: Env, userId: string, channel: string): Promise<Site | null> {
  return env.DB.prepare(`
    SELECT s.id, s.user_id, s.name, s.root_path, s.slug, s.upload_token, s.size_bytes,
           s.file_count, s.expected_file_count, s.expires_at, s.published_at, s.created_at, s.deleted_at
    FROM site_channels sc
    JOIN sites s ON s.id = sc.site_id
    WHERE sc.user_id = ?
      AND sc.channel = ?
      AND s.deleted_at IS NULL
      AND (s.expires_at IS NULL OR datetime(s.expires_at) > datetime('now'))
    LIMIT 1
  `).bind(userId, channel).first<Site>();
}

async function getSiteBySlug(env: Env, slug: string): Promise<Site | null> {
  return env.DB.prepare(`
    SELECT id, user_id, name, root_path, slug, upload_token, size_bytes, file_count, expected_file_count,
           expires_at, published_at, created_at, deleted_at
    FROM sites
    WHERE slug = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(slug).first<Site>();
}

async function getSlugConflict(env: Env, slug: string, currentSiteId?: string): Promise<Site | null> {
  const idMatch = await getSite(env, slug);
  if (idMatch) {
    return idMatch;
  }

  const slugMatch = await getSiteBySlug(env, slug);
  return slugMatch && slugMatch.id !== currentSiteId ? slugMatch : null;
}

async function getSiteIdentifierConflict(env: Env, identifier: string): Promise<Site | null> {
  const idMatch = await getSite(env, identifier);
  if (idMatch) {
    return idMatch;
  }

  return getSiteBySlug(env, identifier);
}

async function getSiteByIdentifier(env: Env, identifier: string): Promise<Site | null> {
  return getSiteIdentifierConflict(env, identifier);
}

async function getPublishedSiteByIdentifier(env: Env, identifier: string): Promise<Site | null> {
  const idMatch = await env.DB.prepare(`
    SELECT id, user_id, name, root_path, slug, upload_token, size_bytes, file_count, expected_file_count,
           expires_at, published_at, created_at, deleted_at
    FROM sites
    WHERE id = ?
      AND deleted_at IS NULL
      AND published_at IS NOT NULL
    LIMIT 1
  `).bind(identifier).first<Site>();
  if (idMatch) {
    return idMatch;
  }

  return env.DB.prepare(`
    SELECT id, user_id, name, root_path, slug, upload_token, size_bytes, file_count, expected_file_count,
           expires_at, published_at, created_at, deleted_at
    FROM sites
    WHERE slug = ?
      AND deleted_at IS NULL
      AND published_at IS NOT NULL
    LIMIT 1
  `).bind(identifier).first<Site>();
}

async function listSiteObjectKeys(env: Env, siteId: string): Promise<string[]> {
  const keys: string[] = [];
  let after = '';

  while (true) {
    const files = await env.DB.prepare(`
      SELECT r2_key
      FROM site_files
      WHERE site_id = ? AND r2_key > ?
      ORDER BY r2_key
      LIMIT ?
    `).bind(siteId, after, 500).all<{ r2_key: string }>();
    const page = files.results || [];
    keys.push(...page.map(file => file.r2_key));
    if (page.length < 500) {
      return keys;
    }
    after = page[page.length - 1].r2_key;
  }
}

async function touchSiteDraft(env: Env, siteId: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE sites
    SET last_activity_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL AND published_at IS NULL
  `).bind(siteId).run();
}

async function deletePendingR2Objects(env: Env, keys: string[]): Promise<void> {
  for (let offset = 0; offset < keys.length; offset += 100) {
    const chunk = keys.slice(offset, offset + 100);
    try {
      await env.BUCKET.delete(chunk);
      await env.DB.batch(chunk.map(key =>
        env.DB.prepare('DELETE FROM pending_r2_deletions WHERE r2_key = ?').bind(key)
      ));
    } catch (err) {
      console.error(`Failed to delete ${chunk.length} pending R2 object(s):`, err);
    }
  }
}

async function queueAndDeleteR2Object(env: Env, key: string): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO pending_r2_deletions (r2_key) VALUES (?)
    `).bind(key).run();
  } catch (queueError) {
    try {
      await env.BUCKET.delete(key);
    } catch (deleteError) {
      console.error('Failed to queue or delete an uncommitted R2 object:', queueError, deleteError);
    }
    return;
  }

  await deletePendingR2Objects(env, [key]);
}

function getReplacementTargetId(site: Site): string | null {
  if (!site.name.startsWith(REPLACEMENT_NAME_PREFIX)) {
    return null;
  }

  const rest = site.name.slice(REPLACEMENT_NAME_PREFIX.length);
  const separator = rest.indexOf(':');
  return separator === -1 ? null : rest.slice(0, separator);
}

function stripReplacementName(name: string): string {
  if (!name.startsWith(REPLACEMENT_NAME_PREFIX)) {
    return name;
  }

  const rest = name.slice(REPLACEMENT_NAME_PREFIX.length);
  const separator = rest.indexOf(':');
  return separator === -1 ? 'site' : sanitizeSiteName(rest.slice(separator + 1));
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
      last_activity_at: site.last_activity_at || site.created_at,
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

function parseBoundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    return fallback;
  }

  return Math.min(parsed, max);
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
