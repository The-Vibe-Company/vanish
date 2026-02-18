export interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  BASE_URL: string;
  SELF_HOSTED: string;
  DEFAULT_TIER: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
}

export type Tier = 'anonymous' | 'free' | 'pro';

export interface User {
  id: string;
  github_id: number | null;
  email: string | null;
  github_username: string | null;
  tier: Tier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Upload {
  id: string;
  user_id: string | null;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  expires_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export const TIER_LIMITS = {
  anonymous: {
    maxFileSize: 5 * 1024 * 1024, // 5 MB
    maxTotalStorage: null, // no total limit (ephemeral, 24h)
    maxExpiryHours: 24,
    rateLimit: 10, // per hour
    imageOnly: true,
    customTtl: false,
  },
  free: {
    maxFileSize: 50 * 1024 * 1024, // 50 MB
    maxTotalStorage: 50 * 1024 * 1024, // 50 MB total
    maxExpiryHours: 48,
    rateLimit: 50,
    imageOnly: false,
    customTtl: false,
  },
  pro: {
    maxFileSize: 1024 * 1024 * 1024, // 1 GB
    maxTotalStorage: 1024 * 1024 * 1024, // 1 GB total
    maxExpiryHours: 30 * 24, // 30 days default
    maxCustomExpiryDays: 365,
    rateLimit: 200,
    imageOnly: false,
    customTtl: true,
  },
} as const;

// Blocked executable file extensions
export const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr',
  '.sh', '.bash', '.ps1', '.psm1',
]);

// Allowed image extensions for anonymous tier
export const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.bmp', '.tiff', '.tif', '.avif', '.heic', '.heif', '.ico',
]);
