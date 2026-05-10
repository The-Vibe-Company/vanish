import type { Env } from '../types.js';

const BATCH_SIZE = 100;

/**
 * Cron handler: deletes expired files from R2 and marks them deleted in D1.
 * Runs every hour via Cloudflare Cron Triggers.
 */
export async function handleCleanup(env: Env): Promise<void> {
  let totalDeleted = 0;
  let totalSitesDeleted = 0;
  let totalPendingObjectsDeleted = 0;

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

  while (true) {
    const expiredSites = await env.DB.prepare(`
      SELECT id FROM sites
      WHERE expires_at IS NOT NULL
        AND expires_at < datetime('now')
        AND deleted_at IS NULL
      LIMIT ?
    `).bind(BATCH_SIZE).all<{ id: string }>();

    if (!expiredSites.results || expiredSites.results.length === 0) {
      break;
    }

    const siteIds = expiredSites.results.map(r => r.id);
    for (const siteId of siteIds) {
      await deleteSiteFiles(env, siteId);
    }

    const stmts = siteIds.map(siteId =>
      env.DB.prepare('UPDATE sites SET deleted_at = datetime(\'now\') WHERE id = ?').bind(siteId)
    );
    await env.DB.batch(stmts);

    totalSitesDeleted += siteIds.length;

    if (siteIds.length < BATCH_SIZE) {
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

  while (true) {
    const pendingObjects = await env.DB.prepare(`
      SELECT r2_key FROM pending_r2_deletions
      LIMIT ?
    `).bind(BATCH_SIZE).all<{ r2_key: string }>();

    const keys = pendingObjects.results || [];
    if (keys.length === 0) {
      break;
    }

    for (const { r2_key: key } of keys) {
      await env.BUCKET.delete(key);
      await env.DB.prepare('DELETE FROM pending_r2_deletions WHERE r2_key = ?').bind(key).run();
      totalPendingObjectsDeleted++;
    }

    if (keys.length < BATCH_SIZE) {
      break;
    }
  }

  console.log(
    `Cleanup complete: ${totalDeleted} expired uploads deleted, ` +
    `${totalSitesDeleted} expired sites deleted, ${totalPendingObjectsDeleted} pending objects deleted`
  );
}

async function deleteSiteFiles(env: Env, siteId: string): Promise<void> {
  while (true) {
    const files = await env.DB.prepare(`
      SELECT r2_key FROM site_files WHERE site_id = ? LIMIT ?
    `).bind(siteId, BATCH_SIZE).all<{ r2_key: string }>();

    const keys = files.results || [];
    if (keys.length === 0) {
      break;
    }

    await Promise.all(keys.map(file => env.BUCKET.delete(file.r2_key)));

    const placeholders = keys.map(() => '?').join(',');
    await env.DB.prepare(`
      DELETE FROM site_files WHERE site_id = ? AND r2_key IN (${placeholders})
    `).bind(siteId, ...keys.map(file => file.r2_key)).run();
  }
}
