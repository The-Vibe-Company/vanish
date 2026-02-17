import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, Upload } from '../types.js';
import { TIER_LIMITS, BLOCKED_EXTENSIONS } from '../types.js';
import { calculateExpiry } from '../lib/expiry.js';

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
    const stats = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(size_bytes), 0) as total_bytes
      FROM uploads
      WHERE user_id = ? AND deleted_at IS NULL
    `).bind(user.id).first<{ total_bytes: number }>();

    const currentUsage = stats?.total_bytes || 0;
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

  const id = nanoid(12);
  const expiresAt = calculateExpiry(tier);

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

function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    json: 'application/json',
    txt: 'text/plain',
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    mp4: 'video/mp4',
    webm: 'video/webm',
    zip: 'application/zip',
    gz: 'application/gzip',
    tar: 'application/x-tar',
    md: 'text/markdown',
    csv: 'text/csv',
    xml: 'application/xml',
    log: 'text/plain',
  };
  return types[ext || ''] || 'application/octet-stream';
}

export default upload;
