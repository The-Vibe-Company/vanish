import type { Tier } from '../types.js';
import { TIER_LIMITS } from '../types.js';

/**
 * Calculate expiry timestamp based on tier.
 * Returns ISO 8601 string, or null for unlimited (Pro).
 */
export function calculateExpiry(tier: Tier): string | null {
  const limits = TIER_LIMITS[tier];
  if (limits.maxExpiryHours === null) {
    return null; // Pro: unlimited
  }
  const expiresAt = new Date(Date.now() + limits.maxExpiryHours * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

/**
 * Check if an upload has expired.
 */
export function isExpired(expiresAt: string | null): boolean {
  if (expiresAt === null) return false; // unlimited
  return new Date(expiresAt) < new Date();
}
