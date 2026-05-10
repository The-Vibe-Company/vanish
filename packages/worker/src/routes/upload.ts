import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env } from '../types.js';
import { TIER_LIMITS, BLOCKED_EXTENSIONS, ALLOWED_IMAGE_EXTENSIONS } from '../types.js';
import { calculateExpiry } from '../lib/expiry.js';
import { guessContentType } from '../lib/content-type.js';
import { getActiveStorageBytes } from '../lib/storage.js';
import {
  getIdempotencyKey,
  getIdempotencyOwner,
  getIdempotentReplay,
  saveIdempotentResponse,
  structuredError,
} from '../lib/api-response.js';

const upload = new Hono<{ Bindings: Env }>();

upload.post('/upload', async (c) => {
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
    const replay = await getIdempotentReplay(c.env, 'upload', idempotencyOwner, idempotencyKey);
    if (replay) {
      return c.json(replay.body, replay.status as 200 | 201);
    }
  }

  // Get filename from header or query param
  const filename = c.req.header('X-Filename')
    || c.req.query('filename')
    || 'upload';

  // Check blocked extensions
  const ext = filename.includes('.') ? '.' + filename.split('.').pop()!.toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return c.json(structuredError('blocked_file_type', `File type ${ext} is not allowed`, 400), 400);
  }

  // Image-only restriction for anonymous tier
  if (limits.imageOnly) {
    if (!ext || !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      return c.json(structuredError(
        'anonymous_image_only',
        'Anonymous uploads are limited to images only. Allowed: png, jpg, gif, webp, svg, avif, heic. Login for other file types: vanish login',
        400,
        { hint: 'Login for other file types: vanish login', upgradeRequired: true },
      ), 400);
    }
  }

  // Read body as ArrayBuffer
  const body = await c.req.arrayBuffer();
  const size = body.byteLength;

  if (size === 0) {
    return c.json(structuredError('empty_file', 'Empty file', 400), 400);
  }

  if (size > limits.maxFileSize) {
    const maxMB = Math.round(limits.maxFileSize / (1024 * 1024));
    return c.json({
      ...structuredError('file_too_large', `File too large. Max ${maxMB}MB for ${tier} tier.`, 413, {
        limits: { maxBytes: limits.maxFileSize },
        upgradeRequired: tier !== 'pro',
      }),
      maxBytes: limits.maxFileSize,
    }, 413);
  }

  // Check total storage quota
  if (limits.maxTotalStorage && user) {
    const currentUsage = await getActiveStorageBytes(c.env, user.id);
    if (currentUsage + size > limits.maxTotalStorage) {
      const maxMB = Math.round(limits.maxTotalStorage / (1024 * 1024));
      const usedMB = Math.round(currentUsage / (1024 * 1024));
      return c.json({
        ...structuredError('storage_quota_exceeded', `Storage quota exceeded. ${usedMB}MB used of ${maxMB}MB for ${tier} tier.`, 413, {
          limits: { maxTotalBytes: limits.maxTotalStorage, usedBytes: currentUsage },
          upgradeRequired: tier !== 'pro',
        }),
        maxTotalBytes: limits.maxTotalStorage,
        usedBytes: currentUsage,
      }, 413);
    }
  }

  // Detect content type
  const contentType = c.req.header('Content-Type') === 'application/octet-stream'
    ? guessContentType(filename)
    : c.req.header('Content-Type') || guessContentType(filename);

  // Validate content type for image-only tiers
  if (limits.imageOnly && !contentType.startsWith('image/')) {
    return c.json(structuredError(
      'anonymous_image_only',
      `Anonymous uploads are limited to images only. Detected type: ${contentType}. Login to upload other files: vanish login`,
      400,
      { hint: 'Login to upload other files: vanish login', upgradeRequired: true },
    ), 400);
  }

  // Parse optional custom TTL (days) — pro tier only
  const daysParam = c.req.header('X-Expires-Days') || c.req.query('days');
  let customDays: number | undefined;
  if (daysParam !== undefined && daysParam !== null) {
    const parsed = parseInt(daysParam, 10);
    if (isNaN(parsed) || parsed < 1) {
      return c.json(structuredError('invalid_days', 'Invalid days parameter. Must be a positive integer.', 400), 400);
    }
    if (!limits.customTtl) {
      return c.json(structuredError(
        'custom_ttl_requires_pro',
        `Custom TTL is only available for Pro tier. Current tier: ${tier}.`,
        403,
        { hint: 'Upgrade with: vanish upgrade', upgradeRequired: true },
      ), 403);
    }
    if (parsed > TIER_LIMITS.pro.maxCustomExpiryDays) {
      return c.json(structuredError('custom_ttl_too_long', `Maximum custom TTL is ${TIER_LIMITS.pro.maxCustomExpiryDays} days.`, 400), 400);
    }
    customDays = parsed;
  }

  const id = nanoid(12);
  const expiresAt = calculateExpiry(tier, customDays);

  // Upload to R2
  await c.env.BUCKET.put(id, body, {
    httpMetadata: {
      contentType: contentType,
    },
    customMetadata: {
      filename,
      uploadedBy: user?.id || 'anonymous',
    },
  });

  // Record in D1
  await c.env.DB.prepare(`
    INSERT INTO uploads (id, user_id, filename, content_type, size_bytes, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, user?.id || null, filename, contentType, size, expiresAt).run();

  const fileExt = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  const url = fileExt ? `${c.env.BASE_URL}/f/${id}.${fileExt}` : `${c.env.BASE_URL}/f/${id}`;

  const result = {
    url,
    id,
    filename,
    size,
    expires: expiresAt,
    tier,
    deletable: Boolean(user),
  };

  await saveIdempotentResponse(c.env, 'upload', idempotencyOwner, idempotencyKey, 201, result);

  return c.json(result, 201);
});

export default upload;
