import type { Env, Tier } from '../types.js';
import { TIER_LIMITS } from '../types.js';

export async function getActiveStorageBytes(env: Env, userId: string): Promise<number> {
  const uploads = await env.DB.prepare(`
    SELECT COALESCE(SUM(size_bytes), 0) as total_bytes
    FROM uploads
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).bind(userId).first<{ total_bytes: number }>();

  const sites = await env.DB.prepare(`
    SELECT COALESCE(SUM(size_bytes), 0) as total_bytes
    FROM sites
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).bind(userId).first<{ total_bytes: number }>();

  return (uploads?.total_bytes || 0) + (sites?.total_bytes || 0);
}

export async function ensureStorageAvailable(
  env: Env,
  tier: Tier,
  userId: string | null,
  incomingBytes: number,
  options: { excludeSiteId?: string } = {},
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

  if (options.excludeSiteId) {
    const currentSite = await env.DB.prepare(`
      SELECT COALESCE(size_bytes, 0) as size_bytes
      FROM sites
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).bind(options.excludeSiteId, userId).first<{ size_bytes: number }>();
    usedBytes -= currentSite?.size_bytes || 0;
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
