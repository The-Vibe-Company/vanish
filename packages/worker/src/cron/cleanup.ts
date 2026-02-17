import type { Env } from '../types.js';

const BATCH_SIZE = 100;

/**
 * Cron handler: deletes expired files from R2 and marks them deleted in D1.
 * Runs every hour via Cloudflare Cron Triggers.
 */
export async function handleCleanup(env: Env): Promise<void> {
  let totalDeleted = 0;

  while (true) {
    // Find expired uploads not yet cleaned up
    const expired = await env.DB.prepare(`
      SELECT id FROM uploads
      WHERE expires_at IS NOT NULL
        AND expires_at < datetime('now')
        AND deleted_at IS NULL
      LIMIT ?
    `).bind(BATCH_SIZE).all<{ id: string }>();

    if (!expired.results || expired.results.length === 0) {
      break;
    }

    const ids = expired.results.map(r => r.id);

    // Delete from R2 in parallel
    await Promise.all(ids.map(id => env.BUCKET.delete(id)));

    // Mark deleted in D1
    // D1 doesn't support IN with bind params well, so batch with individual updates
    const stmts = ids.map(id =>
      env.DB.prepare('UPDATE uploads SET deleted_at = datetime(\'now\') WHERE id = ?').bind(id)
    );
    await env.DB.batch(stmts);

    totalDeleted += ids.length;

    // If we got fewer than BATCH_SIZE, we're done
    if (ids.length < BATCH_SIZE) {
      break;
    }
  }

  // Also clean up expired auth sessions
  await env.DB.prepare(`
    DELETE FROM auth_sessions WHERE expires_at < datetime('now')
  `).run();

  // Clean up old rate limit records (2h retention, beyond the 1h window)
  await env.DB.prepare(`
    DELETE FROM rate_limits WHERE created_at < datetime('now', '-2 hours')
  `).run();

  console.log(`Cleanup complete: ${totalDeleted} expired uploads deleted`);
}
