import { Hono } from 'hono';
import type { Env, Upload } from '../types.js';
import { isExpired } from '../lib/expiry.js';
import { getUploadAccess, hasAccess, isProtectedPolicy, renderAccessGate } from '../lib/site-access.js';

const serve = new Hono<{ Bindings: Env }>();

serve.get('/f/:id{.+}', async (c) => {
  const id = c.req.param('id').replace(/\.[^.]+$/, '');

  // Look up in D1
  const upload = await c.env.DB.prepare(`
    SELECT * FROM uploads WHERE id = ? AND deleted_at IS NULL
  `).bind(id).first<Upload>();

  if (!upload) {
    return c.json({ error: 'File not found' }, 404);
  }

  if (isExpired(upload.expires_at)) {
    // Mark as deleted for faster future lookups
    c.executionCtx.waitUntil(
      c.env.DB.prepare('UPDATE uploads SET deleted_at = datetime(\'now\') WHERE id = ?')
        .bind(id).run()
    );
    return c.json({ error: 'This file has expired' }, 410);
  }

  // Check access before touching R2 so a gate never streams the file.
  const access = await getUploadAccess(c.env, upload.id);
  const protectedFile = isProtectedPolicy(access);
  if (protectedFile) {
    const subject = { kind: 'upload' as const, id: upload.id };
    if (!(await hasAccess(c.req.raw, c.env, subject, access))) {
      return renderAccessGate(subject, access.mode === 'email' ? 'email' : 'password', new URL(c.req.url).pathname);
    }
  }

  // Fetch from R2
  const object = await c.env.BUCKET.get(id);
  if (!object) {
    // R2 object missing but DB record exists — clean up
    c.executionCtx.waitUntil(
      c.env.DB.prepare('UPDATE uploads SET deleted_at = datetime(\'now\') WHERE id = ?')
        .bind(id).run()
    );
    return c.json({ error: 'File not found' }, 404);
  }

  const headers = new Headers();
  const contentType = upload.content_type || 'application/octet-stream';
  headers.set('Content-Type', contentType);
  headers.set('Content-Length', String(upload.size_bytes));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Cache-Control', protectedFile ? 'private, no-store' : 'public, max-age=3600');
  if (protectedFile) headers.set('Vary', 'Cookie');
  const isAttachment = isActiveContent(contentType, upload.filename);
  if (isAttachment) {
    // Defense in depth: if a browser renders it anyway, give it an opaque origin.
    headers.set('Content-Security-Policy', 'sandbox');
  }
  const disposition = isAttachment ? 'attachment' : 'inline';
  headers.set('Content-Disposition', `${disposition}; filename="${escapeHeaderFilename(upload.filename)}"`);
  headers.set('Link', '<mailto:abuse@vanish.sh>; rel="abuse"');

  // CORS for embedding in GitHub/GitLab
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(object.body, { headers });
});

// DELETE /f/:id — requires auth and ownership
serve.delete('/f/:id{.+}', async (c) => {
  const id = c.req.param('id').replace(/\.[^.]+$/, '');
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const upload = await c.env.DB.prepare(`
    SELECT * FROM uploads WHERE id = ? AND deleted_at IS NULL
  `).bind(id).first<Upload>();

  if (!upload) {
    return c.json({ error: 'File not found' }, 404);
  }

  if (upload.user_id !== user.id) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  // Delete from R2 and mark deleted in D1
  await Promise.all([
    c.env.BUCKET.delete(id),
    c.env.DB.prepare('UPDATE uploads SET deleted_at = datetime(\'now\') WHERE id = ?')
      .bind(id).run(),
  ]);

  return c.json({ ok: true });
});

export default serve;

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
