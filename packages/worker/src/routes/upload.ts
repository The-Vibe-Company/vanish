import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env } from '../types.js';
import { TIER_LIMITS, BLOCKED_EXTENSIONS, ALLOWED_IMAGE_EXTENSIONS } from '../types.js';
import { calculateExpiry } from '../lib/expiry.js';
import { guessContentType } from '../lib/content-type.js';
import { getActiveStorageBytes } from '../lib/storage.js';

const upload = new Hono<{ Bindings: Env }>();

upload.post('/upload', async (c) => {
  const tier = c.get('tier');
  const user = c.get('user');
  const limits = TIER_LIMITS[tier];

  // Get filename from header or query param
  const filename = c.req.header('X-Filename')
    || c.req.query('filename')
    || 'upload';

  // Check blocked extensions
  const ext = filename.includes('.') ? '.' + filename.split('.').pop()!.toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return c.json({ error: `File type ${ext} is not allowed` }, 400);
  }

  // Image-only restriction for anonymous tier
  if (limits.imageOnly) {
    if (!ext || !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      return c.json({
        error: 'Anonymous uploads are limited to images only. Allowed: png, jpg, gif, webp, svg, avif, heic. Login for other file types: vanish login',
      }, 400);
    }
  }

  // Read body as ArrayBuffer
  const body = await c.req.arrayBuffer();
  const size = body.byteLength;

  if (size === 0) {
    return c.json({ error: 'Empty file' }, 400);
  }

  if (size > limits.maxFileSize) {
    const maxMB = Math.round(limits.maxFileSize / (1024 * 1024));
    return c.json({
      error: `File too large. Max ${maxMB}MB for ${tier} tier.`,
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
        error: `Storage quota exceeded. ${usedMB}MB used of ${maxMB}MB for ${tier} tier.`,
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
    return c.json({
      error: `Anonymous uploads are limited to images only. Detected type: ${contentType}. Login to upload other files: vanish login`,
    }, 400);
  }

  // Parse optional custom TTL (days) — pro tier only
  const daysParam = c.req.header('X-Expires-Days') || c.req.query('days');
  let customDays: number | undefined;
  if (daysParam !== undefined && daysParam !== null) {
    const parsed = parseInt(daysParam, 10);
    if (isNaN(parsed) || parsed < 1) {
      return c.json({ error: 'Invalid days parameter. Must be a positive integer.' }, 400);
    }
    if (!limits.customTtl) {
      return c.json({
        error: `Custom TTL is only available for Pro tier. Current tier: ${tier}.`,
        hint: 'Upgrade with: vanish upgrade',
      }, 403);
    }
    if (parsed > TIER_LIMITS.pro.maxCustomExpiryDays) {
      return c.json({
        error: `Maximum custom TTL is ${TIER_LIMITS.pro.maxCustomExpiryDays} days.`,
      }, 400);
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

  return c.json({
    url,
    id,
    filename,
    size,
    expires: expiresAt,
  }, 201);
});

export default upload;
