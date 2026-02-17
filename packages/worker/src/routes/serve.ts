import { Hono } from 'hono';
import type { Env, Upload } from '../types.js';
import { isExpired } from '../lib/expiry.js';

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
  headers.set('Content-Type', upload.content_type || 'application/octet-stream');
  headers.set('Content-Length', String(upload.size_bytes));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'public, max-age=3600');
  headers.set('Content-Disposition', `inline; filename="${upload.filename}"`);

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
