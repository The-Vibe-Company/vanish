import type { Tier } from '../types.js';
import { TIER_LIMITS } from '../types.js';

/**
 * Calculate expiry timestamp based on tier.
 * Returns ISO 8601 string. All tiers now have finite retention.
 * @param tier - User tier
 * @param customDays - Optional custom TTL in days (paid tiers only, 1-365)
 */
export function calculateExpiry(tier: Tier, customDays?: number): string {
  const limits = TIER_LIMITS[tier];

  let expiryHours: number;

  if (customDays !== undefined && limits.customTtl) {
    const maxDays = limits.maxCustomExpiryDays;
    const clampedDays = Math.max(1, Math.min(customDays, maxDays));
    expiryHours = clampedDays * 24;
  } else {
    expiryHours = limits.maxExpiryHours;
  }

  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

/**
 * Check if an upload has expired.
 */
export function isExpired(expiresAt: string | null): boolean {
  if (expiresAt === null) return false; // unlimited
  return new Date(expiresAt) < new Date();
}
