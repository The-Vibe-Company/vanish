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
    maxFileSize: 2 * 1024 * 1024, // 2 MB
    maxExpiryHours: 48,
    rateLimit: 10, // per hour
  },
  free: {
    maxFileSize: 50 * 1024 * 1024, // 50 MB
    maxExpiryHours: 30 * 24, // 30 days
    rateLimit: 50,
  },
  pro: {
    maxFileSize: 1024 * 1024 * 1024, // 1 GB
    maxExpiryHours: null, // unlimited
    rateLimit: 200,
  },
} as const;

// Blocked executable file extensions
export const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr',
  '.sh', '.bash', '.ps1', '.psm1',
]);
