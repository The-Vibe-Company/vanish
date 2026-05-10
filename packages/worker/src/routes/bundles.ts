import { Hono } from 'hono';
import { customAlphabet, nanoid } from 'nanoid';
import type { Context } from 'hono';
import type { Bundle, BundleFile, Env, Tier } from '../types.js';
import { ALLOWED_IMAGE_EXTENSIONS, BLOCKED_EXTENSIONS, TIER_LIMITS } from '../types.js';
import { calculateExpiry, isExpired } from '../lib/expiry.js';
import { guessContentType } from '../lib/content-type.js';
import { ensureStorageAvailable } from '../lib/storage.js';
import { normalizeSitePath } from '../lib/site-path.js';
import { hashApiKey } from '../lib/api-key.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import {
  getIdempotencyKey,
  getIdempotencyOwner,
  getIdempotentReplay,
  clearIdempotencyReservation,
  reserveIdempotencyKey,
  structuredError,
} from '../lib/api-response.js';

const BUNDLE_ID = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);
const BUNDLE_TOKEN_PREFIX = 'vnbd_';

const bundles = new Hono<{ Bindings: Env }>();
type AppContext = Context<{ Bindings: Env }>;

interface CreateBundleRequest {
  name?: string;
  fileCount?: number;
  totalBytes?: number;
  days?: number;
}

bundles.post('/bundles', rateLimitMiddleware, async (c) => {
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
    const replay = await getIdempotentReplay(c.env, 'bundle-create', idempotencyOwner, idempotencyKey);
    if (replay) {
      return c.json(replay.body, replay.status as 201);
    }
  }

  const payload = await readJson<CreateBundleRequest>(c.req.raw);
  if (!payload) {
    return c.json(structuredError('invalid_json', 'Invalid JSON body', 400), 400);
  }

  const plannedFileCount = parsePositiveInteger(payload.fileCount);
  if (plannedFileCount === null) {
    return c.json(structuredError('invalid_file_count', 'fileCount is required and must be a positive integer', 400), 400);
  }
  if (plannedFileCount > limits.maxSiteFiles) {
    return c.json({
      ...structuredError('too_many_files', `Too many files. Max ${limits.maxSiteFiles} files for ${tier} tier.`, 413),
      maxFiles: limits.maxSiteFiles,
    }, 413);
  }

  const totalBytes = parsePositiveInteger(payload.totalBytes);
  if (totalBytes === null) {
    return c.json(structuredError('invalid_total_bytes', 'totalBytes is required and must be a positive integer', 400), 400);
  }

  let customDays: number | undefined;
  if (payload.days !== undefined) {
    customDays = parsePositiveInteger(payload.days) ?? undefined;
    if (!customDays) {
      return c.json(structuredError('invalid_days', 'days must be a positive integer', 400), 400);
    }
    if (!limits.customTtl) {
      return c.json(structuredError(
        'custom_ttl_requires_pro',
        `Custom TTL is only available for Pro tier. Current tier: ${tier}.`,
        403,
        { hint: user ? 'Upgrade with: vanish upgrade' : 'Login and upgrade with: vanish login && vanish upgrade', upgradeRequired: true },
      ), 403);
    }
    if (customDays > TIER_LIMITS.pro.maxCustomExpiryDays) {
      return c.json(structuredError('custom_ttl_too_long', `Maximum custom TTL is ${TIER_LIMITS.pro.maxCustomExpiryDays} days.`, 400), 400);
    }
  }

  const quota = await ensureStorageAvailable(c.env, tier, user?.id || null, totalBytes);
  if (!quota.ok) {
    return c.json({
      ...structuredError('storage_quota_exceeded', quota.error, 413, {
        limits: { maxTotalBytes: quota.maxTotalBytes, usedBytes: quota.usedBytes },
        upgradeRequired: tier !== 'pro',
      }),
      maxTotalBytes: quota.maxTotalBytes,
      usedBytes: quota.usedBytes,
    }, 413);
  }

  const id = BUNDLE_ID();
  const uploadToken = BUNDLE_TOKEN_PREFIX + nanoid(32);
  const expiresAt = calculateExpiry(tier, customDays);
  const name = sanitizeBundleName(payload.name || id);
  const result = {
    id,
    token: uploadToken,
    url: `${c.env.BASE_URL}/b/${id}`,
    name,
    fileCount: plannedFileCount,
    maxFiles: limits.maxSiteFiles,
    maxBytes: tier === 'anonymous' ? TIER_LIMITS.anonymous.maxSiteSize : limits.maxTotalStorage,
    expires: expiresAt,
  };

  if (idempotencyKey) {
    const reservation = await reserveIdempotencyKey(c.env, 'bundle-create', idempotencyOwner, idempotencyKey);
    if (!reservation.ok) {
      return c.json(reservation.body, reservation.status as 201 | 409);
    }
  }

  try {
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(`
        INSERT INTO bundles (id, user_id, name, upload_token, size_bytes, file_count, expected_file_count, expires_at)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?)
      `).bind(id, user?.id || null, name, uploadToken, plannedFileCount, expiresAt),
    ];

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
      `).bind(201, JSON.stringify(result), 'bundle-create', idempotencyOwner, idempotencyKey));
    }

    await c.env.DB.batch(statements);
  } catch (err) {
    if (idempotencyKey) {
      await clearIdempotencyReservation(c.env, 'bundle-create', idempotencyOwner, idempotencyKey).catch(clearErr => {
        console.error('Failed to clear bundle create idempotency reservation:', clearErr);
      });
    }
    throw err;
  }

  return c.json(result, 201);
});

bundles.put('/bundles/:id/files', async (c) => {
  const bundle = await getBundle(c.env, c.req.param('id'));
  if (!bundle) {
    return c.json(structuredError('bundle_not_found', 'Bundle not found', 404), 404);
  }
  if (bundle.published_at) {
    return c.json(structuredError('bundle_published', 'Published bundles cannot be modified', 409), 409);
  }
  if (isExpired(bundle.expires_at)) {
    await deleteBundleObjectsAndMarkDeleted(c.env, bundle.id);
    return c.json(structuredError('bundle_expired', 'This bundle has expired', 410), 410);
  }

  const auth = authorizeBundleMutation(c, bundle);
  if (!auth.ok) {
    return c.json(structuredError(auth.code, auth.error, auth.status), auth.status);
  }

  const path = c.req.query('path') ? normalizeSitePath(c.req.query('path') || '') : null;
  if (!path) {
    return c.json(structuredError('invalid_path', 'path query parameter is required and must be a relative file path', 400), 400);
  }

  const ext = getExtension(path);
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return c.json(structuredError('blocked_file_type', `File type ${ext} is not allowed in bundles`, 400), 400);
  }

  const limits = TIER_LIMITS[auth.tier];
  if (limits.imageOnly && (!ext || !ALLOWED_IMAGE_EXTENSIONS.has(ext))) {
    return c.json(structuredError(
      'anonymous_image_only',
      'Anonymous bundles are limited to image files. Login for other file types: vanish login',
      400,
      { hint: 'Run: vanish login', upgradeRequired: true },
    ), 400);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) {
    return c.json(structuredError('empty_file', 'Empty file', 400), 400);
  }
  if (body.byteLength > limits.maxFileSize) {
    return c.json({
      ...structuredError('file_too_large', `File too large for ${auth.tier} tier.`, 413, {
        limits: { maxBytes: limits.maxFileSize },
        upgradeRequired: auth.tier !== 'pro',
      }),
      maxBytes: limits.maxFileSize,
    }, 413);
  }

  const existingFile = await c.env.DB.prepare(`
    SELECT size_bytes FROM bundle_files WHERE bundle_id = ? AND path = ?
  `).bind(bundle.id, path).first<{ size_bytes: number }>();

  const nextBundleSize = bundle.size_bytes - (existingFile?.size_bytes || 0) + body.byteLength;
  const quota = await ensureStorageAvailable(c.env, auth.tier, auth.userId, nextBundleSize, {
    excludeBundleId: bundle.id,
  });
  if (!quota.ok) {
    return c.json({
      ...structuredError('storage_quota_exceeded', quota.error, 413, {
        limits: { maxTotalBytes: quota.maxTotalBytes, usedBytes: quota.usedBytes },
        upgradeRequired: auth.tier !== 'pro',
      }),
      maxTotalBytes: quota.maxTotalBytes,
      usedBytes: quota.usedBytes,
    }, 413);
  }

  const contentType = c.req.header('Content-Type') === 'application/octet-stream'
    ? guessContentType(path)
    : c.req.header('Content-Type') || guessContentType(path);
  if (limits.imageOnly && !contentType.startsWith('image/')) {
    return c.json(structuredError(
      'anonymous_image_only',
      `Anonymous bundles are limited to images. Detected type: ${contentType}.`,
      400,
      { hint: 'Run: vanish login', upgradeRequired: true },
    ), 400);
  }

  const r2Key = `bundles/${bundle.id}/${path}`;
  await c.env.BUCKET.put(r2Key, body, {
    httpMetadata: { contentType },
    customMetadata: {
      bundleId: bundle.id,
      path,
      uploadedBy: auth.userId || 'anonymous',
    },
  });

  let inserted: D1Result | undefined;
  try {
    [inserted] = await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT OR REPLACE INTO bundle_files (bundle_id, path, filename, content_type, size_bytes, r2_key)
        SELECT ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM bundles
          WHERE id = ?
            AND deleted_at IS NULL
            AND published_at IS NULL
        )
        AND (
          EXISTS (
            SELECT 1 FROM bundle_files
            WHERE bundle_id = ? AND path = ?
          )
          OR (
            SELECT COUNT(*) FROM bundle_files WHERE bundle_id = ?
          ) < (
            SELECT expected_file_count FROM bundles WHERE id = ?
          )
        )
      `).bind(
        bundle.id,
        path,
        path.split('/').pop() || path,
        contentType,
        body.byteLength,
        r2Key,
        bundle.id,
        bundle.id,
        path,
        bundle.id,
        bundle.id,
      ),
      c.env.DB.prepare(`
        UPDATE bundles
        SET size_bytes = (
          SELECT COALESCE(SUM(size_bytes), 0) FROM bundle_files WHERE bundle_id = ?
        ),
        file_count = (
          SELECT COUNT(*) FROM bundle_files WHERE bundle_id = ?
        )
        WHERE id = ?
      `).bind(bundle.id, bundle.id, bundle.id),
    ]);
  } catch (err) {
    cleanupRejectedBundleObject(c, r2Key);
    throw err;
  }

  if ((inserted.meta?.changes || 0) === 0) {
    cleanupRejectedBundleObject(c, r2Key);

    const currentBundle = await getBundle(c.env, bundle.id);
    if (!currentBundle) {
      return c.json(structuredError('bundle_not_found', 'Bundle not found', 404), 404);
    }
    if (currentBundle.published_at) {
      return c.json(structuredError('bundle_published', 'Published bundles cannot be modified', 409), 409);
    }
    if (isExpired(currentBundle.expires_at)) {
      c.executionCtx.waitUntil(deleteBundleObjectsAndMarkDeleted(c.env, currentBundle.id));
      return c.json(structuredError('bundle_expired', 'This bundle has expired', 410), 410);
    }
    if (currentBundle.file_count < currentBundle.expected_file_count) {
      return c.json(structuredError('bundle_state_changed', 'Bundle changed while uploading this file. Retry the upload.', 409, {
        retryable: true,
      }), 409);
    }

    return c.json({
      ...structuredError('too_many_files', `Too many files. This bundle was created for ${currentBundle.expected_file_count} files.`, 413),
      maxFiles: currentBundle.expected_file_count,
    }, 413);
  }

  return c.json({ ok: true, path, size: body.byteLength, contentType });
});

bundles.post('/bundles/:id/publish', async (c) => {
  const bundleId = c.req.param('id');
  const idempotencyKey = getIdempotencyKey(c.req.raw);
  const idempotencyScope = `bundle-publish:${bundleId}`;

  if ((c.req.header('Idempotency-Key') || c.req.header('X-Idempotency-Key')) && !idempotencyKey) {
    return c.json(structuredError('invalid_idempotency_key', 'Invalid idempotency key', 400), 400);
  }

  const bundle = await getBundle(c.env, bundleId);
  if (!bundle) {
    return c.json(structuredError('bundle_not_found', 'Bundle not found', 404), 404);
  }
  if (isExpired(bundle.expires_at)) {
    await deleteBundleObjectsAndMarkDeleted(c.env, bundle.id);
    return c.json(structuredError('bundle_expired', 'This bundle has expired', 410), 410);
  }

  const idempotencyOwner = idempotencyKey
    ? await getBundlePublishIdempotencyOwner(c, bundle)
    : null;
  if (idempotencyKey && idempotencyOwner) {
    const replay = await getIdempotentReplay(c.env, idempotencyScope, idempotencyOwner, idempotencyKey);
    if (replay) {
      return c.json(replay.body, replay.status as 200);
    }
  }

  const auth = authorizeBundleMutation(c, bundle);
  if (!auth.ok) {
    return c.json(structuredError(auth.code, auth.error, auth.status), auth.status);
  }

  const freshBundle = await getBundle(c.env, bundle.id);
  if (!freshBundle || freshBundle.file_count === 0) {
    return c.json(structuredError('empty_bundle', 'No bundle files uploaded', 400), 400);
  }
  if (freshBundle.file_count !== freshBundle.expected_file_count) {
    return c.json(structuredError(
      'incomplete_bundle',
      `Bundle is incomplete. Uploaded ${freshBundle.file_count} of ${freshBundle.expected_file_count} declared files.`,
      400,
    ), 400);
  }

  const quota = await ensureStorageAvailable(c.env, auth.tier, auth.userId, freshBundle.size_bytes, {
    excludeBundleId: bundle.id,
  });
  if (!quota.ok) {
    return c.json({
      ...structuredError('storage_quota_exceeded', quota.error, 413, {
        limits: { maxTotalBytes: quota.maxTotalBytes, usedBytes: quota.usedBytes },
        upgradeRequired: auth.tier !== 'pro',
      }),
      maxTotalBytes: quota.maxTotalBytes,
      usedBytes: quota.usedBytes,
    }, 413);
  }

  const publishedAt = freshBundle.published_at || new Date().toISOString();
  const result = {
    ok: true,
    id: freshBundle.id,
    url: `${c.env.BASE_URL}/b/${freshBundle.id}`,
    size: freshBundle.size_bytes,
    fileCount: freshBundle.file_count,
    expectedFileCount: freshBundle.expected_file_count,
    expires: freshBundle.expires_at,
  };

  const statements: D1PreparedStatement[] = [];
  if (idempotencyKey && idempotencyOwner) {
    statements.push(
      c.env.DB.prepare(`
        DELETE FROM idempotency_keys
        WHERE scope = ?
          AND owner = ?
          AND idempotency_key = ?
          AND expires_at <= datetime('now')
      `).bind(idempotencyScope, idempotencyOwner, idempotencyKey),
      c.env.DB.prepare(`
        INSERT OR IGNORE INTO idempotency_keys (scope, owner, idempotency_key, status, response_json, expires_at)
        VALUES (?, ?, ?, ?, ?, datetime('now', '+48 hours'))
      `).bind(idempotencyScope, idempotencyOwner, idempotencyKey, 200, JSON.stringify(result)),
    );
  }
  statements.push(
    c.env.DB.prepare(`
      UPDATE bundles
      SET published_at = ?, upload_token = NULL
      WHERE id = ?
    `).bind(publishedAt, bundle.id),
  );
  await c.env.DB.batch(statements);

  return c.json(result);
});

bundles.get('/bundles', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json(structuredError('auth_required', 'Authentication required', 401), 401);
  }

  const limit = parseBoundedInteger(c.req.query('limit'), 50, 1, 100);
  const offset = parseBoundedInteger(c.req.query('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
  const activeOnly = c.req.query('active') !== 'false';

  let query = `
    SELECT id, user_id, name, upload_token, size_bytes, file_count, expected_file_count,
           expires_at, published_at, created_at, deleted_at
    FROM bundles
    WHERE user_id = ?
  `;
  if (activeOnly) {
    query += ` AND deleted_at IS NULL AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`;
  }
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;

  const result = await c.env.DB.prepare(query).bind(user.id, limit, offset).all<Bundle>();
  return c.json({ bundles: (result.results || []).map(bundleToJson(c.env.BASE_URL)), limit, offset });
});

bundles.get('/bundles/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json(structuredError('auth_required', 'Authentication required', 401), 401);
  }

  const bundle = await getBundle(c.env, c.req.param('id'));
  if (!bundle) {
    return c.json(structuredError('bundle_not_found', 'Bundle not found', 404), 404);
  }
  if (bundle.user_id !== user.id) {
    return c.json(structuredError('not_authorized', 'Not authorized', 403), 403);
  }

  const files = await listBundleFiles(c.env, bundle.id);
  return c.json({ ...bundleToJson(c.env.BASE_URL)(bundle), files });
});

bundles.delete('/bundles/:id', async (c) => {
  const user = c.get('user');
  const bundle = await getBundle(c.env, c.req.param('id'));
  if (!bundle) {
    return c.json(structuredError('bundle_not_found', 'Bundle not found', 404), 404);
  }

  const token = c.req.header('X-Bundle-Token');
  const tokenCanDeleteDraft = !bundle.published_at && bundle.upload_token && token === bundle.upload_token;
  if (bundle.user_id && !user && !tokenCanDeleteDraft) {
    return c.json(structuredError('auth_required', 'Authentication required', 401), 401);
  }
  if (bundle.user_id !== user?.id && !tokenCanDeleteDraft) {
    return c.json(structuredError('not_authorized', 'Not authorized', 403), 403);
  }

  await deleteBundleObjectsAndMarkDeleted(c.env, bundle.id);
  return c.json({ ok: true });
});

bundles.get('/b/:id/files/:path{.+}', async (c) => {
  const bundle = await getPublishedBundle(c.env, c.req.param('id'));
  if (!bundle) {
    return c.json(structuredError('bundle_not_found', 'Bundle not found', 404), 404);
  }
  if (isExpired(bundle.expires_at)) {
    c.executionCtx.waitUntil(deleteBundleObjectsAndMarkDeleted(c.env, bundle.id));
    return c.json(structuredError('bundle_expired', 'This bundle has expired', 410), 410);
  }

  const path = normalizeSitePath(safeDecode(c.req.param('path')));
  if (!path) {
    return c.json(structuredError('file_not_found', 'File not found', 404), 404);
  }

  const file = await getBundleFile(c.env, bundle.id, path);
  if (!file) {
    return c.json(structuredError('file_not_found', 'File not found', 404), 404);
  }

  const object = await c.env.BUCKET.get(file.r2_key);
  if (!object) {
    return c.json(structuredError('file_not_found', 'File not found', 404), 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', file.content_type || guessContentType(file.filename));
  headers.set('Content-Length', String(file.size_bytes));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Cache-Control', 'public, max-age=3600');
  headers.set('Content-Disposition', `${isActiveContent(file.content_type, file.filename) ? 'attachment' : 'inline'}; filename="${escapeHeaderFilename(file.filename)}"`);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Link', '<mailto:abuse@vanish.sh>; rel="abuse"');

  return new Response(object.body, { headers });
});

bundles.get('/b/:id', async (c) => {
  const bundle = await getPublishedBundle(c.env, c.req.param('id'));
  if (!bundle) {
    return c.json(structuredError('bundle_not_found', 'Bundle not found', 404), 404);
  }
  if (isExpired(bundle.expires_at)) {
    c.executionCtx.waitUntil(deleteBundleObjectsAndMarkDeleted(c.env, bundle.id));
    return c.json(structuredError('bundle_expired', 'This bundle has expired', 410), 410);
  }

  const files = await listBundleFiles(c.env, bundle.id);
  const html = renderBundlePage(c.env.BASE_URL, bundle, files);
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'public, max-age=300',
      'Link': '<mailto:abuse@vanish.sh>; rel="abuse"',
    },
  });
});

function authorizeBundleMutation(
  c: AppContext,
  bundle: Bundle,
): { ok: true; tier: Tier; userId: string | null } | { ok: false; error: string; code: string; status: 401 | 403 } {
  const user = c.get('user');

  if (bundle.user_id) {
    if (!user) {
      return { ok: false, error: 'Authentication required', code: 'auth_required', status: 401 };
    }
    if (user.id !== bundle.user_id) {
      return { ok: false, error: 'Not authorized', code: 'not_authorized', status: 403 };
    }
    return { ok: true, tier: user.tier, userId: user.id };
  }

  const token = c.req.header('X-Bundle-Token');
  if (!bundle.upload_token || token !== bundle.upload_token) {
    return { ok: false, error: 'Bundle token required', code: 'bundle_token_required', status: 401 };
  }

  return { ok: true, tier: 'anonymous', userId: null };
}

async function getBundlePublishIdempotencyOwner(c: AppContext, bundle: Bundle): Promise<string | null> {
  const user = c.get('user');

  if (bundle.user_id) {
    if (user?.id !== bundle.user_id) {
      return null;
    }
    return getIdempotencyOwner(user, c.req.header('CF-Connecting-IP') || null, c.req.header('X-Forwarded-For') || null);
  }

  const token = c.req.header('X-Bundle-Token');
  if (!token) {
    return null;
  }
  if (bundle.upload_token && token !== bundle.upload_token) {
    return null;
  }

  return `bundle-token:${await hashApiKey(token)}`;
}

async function getBundle(env: Env, id: string): Promise<Bundle | null> {
  return env.DB.prepare(`
    SELECT id, user_id, name, upload_token, size_bytes, file_count, expected_file_count,
           expires_at, published_at, created_at, deleted_at
    FROM bundles
    WHERE id = ? AND deleted_at IS NULL
  `).bind(id).first<Bundle>();
}

async function getPublishedBundle(env: Env, id: string): Promise<Bundle | null> {
  return env.DB.prepare(`
    SELECT id, user_id, name, upload_token, size_bytes, file_count, expected_file_count,
           expires_at, published_at, created_at, deleted_at
    FROM bundles
    WHERE id = ?
      AND deleted_at IS NULL
      AND published_at IS NOT NULL
  `).bind(id).first<Bundle>();
}

async function getBundleFile(env: Env, bundleId: string, path: string): Promise<BundleFile | null> {
  return env.DB.prepare(`
    SELECT bundle_id, path, filename, content_type, size_bytes, r2_key, created_at
    FROM bundle_files
    WHERE bundle_id = ? AND path = ?
  `).bind(bundleId, path).first<BundleFile>();
}

async function listBundleFiles(env: Env, bundleId: string): Promise<BundleFile[]> {
  const result = await env.DB.prepare(`
    SELECT bundle_id, path, filename, content_type, size_bytes, r2_key, created_at
    FROM bundle_files
    WHERE bundle_id = ?
    ORDER BY path ASC
  `).bind(bundleId).all<BundleFile>();

  return result.results || [];
}

function cleanupRejectedBundleObject(c: AppContext, r2Key: string): void {
  c.executionCtx.waitUntil(c.env.BUCKET.delete(r2Key).catch(err => {
    console.error(`Failed to clean up rejected bundle object ${r2Key}:`, err);
  }));
}

async function deleteBundleObjectsAndMarkDeleted(env: Env, id: string): Promise<void> {
  while (true) {
    const files = await env.DB.prepare(`
      SELECT r2_key FROM bundle_files WHERE bundle_id = ? LIMIT 100
    `).bind(id).all<{ r2_key: string }>();

    const keys = files.results || [];
    if (keys.length === 0) {
      break;
    }

    await Promise.all(keys.map(file => env.BUCKET.delete(file.r2_key)));
    await env.DB.batch(keys.map(file =>
      env.DB.prepare('DELETE FROM bundle_files WHERE bundle_id = ? AND r2_key = ?').bind(id, file.r2_key)
    ));
  }

  await env.DB.prepare(`
    UPDATE bundles SET deleted_at = datetime('now'), upload_token = NULL WHERE id = ?
  `).bind(id).run();
}

function bundleToJson(baseUrl: string) {
  return (bundle: Bundle) => ({
    id: bundle.id,
    name: bundle.name,
    url: `${baseUrl}/b/${bundle.id}`,
    size_bytes: bundle.size_bytes,
    file_count: bundle.file_count,
    expected_file_count: bundle.expected_file_count,
    expires_at: bundle.expires_at,
    created_at: bundle.created_at,
    published_at: bundle.published_at,
    expired: bundle.expires_at ? new Date(bundle.expires_at) < new Date() : false,
    deleted: bundle.deleted_at !== null,
  });
}

function renderBundlePage(baseUrl: string, bundle: Bundle, files: BundleFile[]): string {
  const rows = files.map(file => {
    const href = `${baseUrl}/b/${bundle.id}/files/${encodeSitePath(file.path)}`;
    return `<li><a href="${escapeHtml(href)}">${escapeHtml(file.path)}</a><span>${escapeHtml(formatBytes(file.size_bytes))}</span></li>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>${escapeHtml(bundle.name)} · vanish bundle</title>
<style>
body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin:32px;background:#08090a;color:#e8edf3}
main{max-width:840px;margin:0 auto}
h1{font-size:22px;font-weight:600;margin:0 0 8px}
p{color:#7d858f;margin:0 0 24px}
ul{list-style:none;padding:0;margin:0;border:1px solid #20252b;border-radius:6px;overflow:hidden}
li{display:flex;justify-content:space-between;gap:16px;padding:12px 14px;border-top:1px solid #20252b}
li:first-child{border-top:0}
a{color:#f0c36a;text-decoration:none;word-break:break-all}
a:focus-visible{outline:2px solid #f0c36a;outline-offset:3px;border-radius:3px}
span{color:#7d858f;white-space:nowrap}
li{min-height:44px;align-items:center}
@media (max-width:560px){body{margin:18px}li{flex-direction:column;align-items:flex-start}}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(bundle.name)}</h1>
<p>${files.length} file${files.length === 1 ? '' : 's'} · expires ${bundle.expires_at ? escapeHtml(bundle.expires_at) : 'never'}</p>
<ul>${rows}</ul>
</main>
</body>
</html>`;
}

function sanitizeBundleName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 120) || 'bundle';
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function parseBoundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value ? parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

function getExtension(path: string): string {
  const filename = path.split('/').pop() || path;
  const index = filename.lastIndexOf('.');
  return index === -1 ? '' : filename.slice(index).toLowerCase();
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function encodeSitePath(path: string): string {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function isActiveContent(contentType: string | null, filename: string): boolean {
  const normalized = (contentType || '').toLowerCase();
  const lowerName = filename.toLowerCase();

  return normalized.includes('text/html')
    || normalized.includes('image/svg+xml')
    || normalized.includes('application/xhtml+xml')
    || normalized.includes('javascript')
    || lowerName.endsWith('.html')
    || lowerName.endsWith('.htm')
    || lowerName.endsWith('.xhtml')
    || lowerName.endsWith('.svg')
    || lowerName.endsWith('.js')
    || lowerName.endsWith('.mjs');
}

function escapeHeaderFilename(filename: string): string {
  return filename.replace(/["\\\r\n]/g, '_');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default bundles;
