import type { Env, Tier } from '../types.js';
import { TIER_LIMITS } from '../types.js';

export async function getActiveStorageBytes(env: Env, userId: string): Promise<number> {
  const uploads = await env.DB.prepare(`
    SELECT COALESCE(SUM(size_bytes), 0) as total_bytes
    FROM uploads
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
  `).bind(userId).first<{ total_bytes: number }>();

  const sites = await env.DB.prepare(`
    SELECT COALESCE(SUM(size_bytes), 0) as total_bytes
    FROM sites
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
  `).bind(userId).first<{ total_bytes: number }>();

  let bundleBytes = 0;
  try {
    const bundles = await env.DB.prepare(`
      SELECT COALESCE(SUM(size_bytes), 0) as total_bytes
      FROM bundles
      WHERE user_id = ?
        AND deleted_at IS NULL
        AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    `).bind(userId).first<{ total_bytes: number }>();
    bundleBytes = bundles?.total_bytes || 0;
  } catch (err) {
    if (!isMissingTableError(err, 'bundles')) {
      throw err;
    }
    bundleBytes = 0;
  }

  return (uploads?.total_bytes || 0) + (sites?.total_bytes || 0) + bundleBytes;
}

export async function ensureStorageAvailable(
  env: Env,
  tier: Tier,
  userId: string | null,
  incomingBytes: number,
  options: { excludeSiteId?: string; excludeSiteIds?: string[]; excludeBundleId?: string; excludeBundleIds?: string[] } = {},
): Promise<{ ok: true } | { ok: false; error: string; maxTotalBytes?: number; usedBytes?: number }> {
  const limits = TIER_LIMITS[tier];

  if (incomingBytes > limits.maxSiteSize) {
    return {
      ok: false,
      error: `Site too large. Max ${formatBytes(limits.maxSiteSize)} for ${tier} tier.`,
      maxTotalBytes: limits.maxSiteSize,
    };
  }

  if (!limits.maxTotalStorage || !userId) {
    return { ok: true };
  }

  let usedBytes = await getActiveStorageBytes(env, userId);

  const excludeSiteIds = new Set([
    ...(options.excludeSiteIds || []),
    ...(options.excludeSiteId ? [options.excludeSiteId] : []),
  ]);

  for (const siteId of excludeSiteIds) {
    const currentSite = await env.DB.prepare(`
      SELECT COALESCE(size_bytes, 0) as size_bytes
      FROM sites
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).bind(siteId, userId).first<{ size_bytes: number }>();
    usedBytes -= currentSite?.size_bytes || 0;
  }

  const excludeBundleIds = new Set([
    ...(options.excludeBundleIds || []),
    ...(options.excludeBundleId ? [options.excludeBundleId] : []),
  ]);

  for (const bundleId of excludeBundleIds) {
    try {
      const currentBundle = await env.DB.prepare(`
        SELECT COALESCE(size_bytes, 0) as size_bytes
        FROM bundles
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      `).bind(bundleId, userId).first<{ size_bytes: number }>();
      usedBytes -= currentBundle?.size_bytes || 0;
    } catch (err) {
      if (!isMissingTableError(err, 'bundles')) {
        throw err;
      }
    }
  }

  if (usedBytes + incomingBytes > limits.maxTotalStorage) {
    return {
      ok: false,
      error: `Storage quota exceeded. ${formatBytes(usedBytes)} used of ${formatBytes(limits.maxTotalStorage)} for ${tier} tier.`,
      maxTotalBytes: limits.maxTotalStorage,
      usedBytes,
    };
  }

  return { ok: true };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  return `${Math.round(bytes / (1024 * 1024 * 1024))}GB`;
}

function isMissingTableError(err: unknown, table: string): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('no such table') && message.includes(table);
}
