export interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  BASE_URL: string;
  SELF_HOSTED: string;
  DEFAULT_TIER: string;
  PRODUCT_EVENTS?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_PRO_PRICE_ID_EUR_10?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CUSTOM_DOMAIN_FALLBACK_HOST?: string;
  ACCESS_SESSION_SECRET?: string;
}

export type Tier = 'anonymous' | 'free' | 'pro';
export type PaidTier = Extract<Tier, 'pro'>;

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

export interface Site {
  id: string;
  user_id: string | null;
  name: string;
  root_path: string;
  slug: string | null;
  upload_token: string | null;
  size_bytes: number;
  file_count: number;
  expected_file_count: number;
  expires_at: string | null;
  published_at: string | null;
  created_at: string;
  last_activity_at?: string | null;
  deleted_at: string | null;
  access_mode?: 'link' | 'password';
}

export interface SiteFile {
  site_id: string;
  path: string;
  content_type: string | null;
  size_bytes: number;
  r2_key: string;
  created_at: string;
}

export type CustomDomainStatus =
  | 'pending_dns'
  | 'pending_tls'
  | 'active'
  | 'error'
  | 'suspended'
  | 'deleting';

export interface CustomDomain {
  hostname: string;
  user_id: string;
  channel: string;
  provider_hostname_id: string | null;
  status: CustomDomainStatus;
  dns_records: string;
  last_error: string | null;
  verified_at: string | null;
  grace_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteAccess {
  site_id: string;
  mode: 'link' | 'password';
  password_hash: string | null;
  password_salt: string | null;
  policy_version: number;
  created_at: string;
  updated_at: string;
}

export interface Bundle {
  id: string;
  user_id: string | null;
  name: string;
  upload_token: string | null;
  size_bytes: number;
  file_count: number;
  expected_file_count: number;
  expires_at: string | null;
  published_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface BundleFile {
  bundle_id: string;
  path: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  r2_key: string;
  created_at: string;
}

export const TIER_LIMITS = {
  anonymous: {
    maxFileSize: 5 * 1024 * 1024, // 5 MB
    maxSiteSize: 10 * 1024 * 1024, // 10 MB
    maxSiteFiles: 100,
    maxTotalStorage: null, // no total limit (ephemeral, 24h)
    maxExpiryHours: 24,
    rateLimit: 10, // per hour
    imageOnly: true,
    customTtl: false,
  },
  free: {
    maxFileSize: 50 * 1024 * 1024, // 50 MB
    maxSiteSize: 50 * 1024 * 1024, // bounded by total storage
    maxSiteFiles: 500,
    maxTotalStorage: 50 * 1024 * 1024, // 50 MB total
    maxExpiryHours: 48,
    rateLimit: 50,
    imageOnly: false,
    customTtl: false,
  },
  pro: {
    maxFileSize: 1024 * 1024 * 1024, // 1 GB
    maxSiteSize: 10 * 1024 * 1024 * 1024, // bounded by total storage
    maxSiteFiles: 5000,
    maxTotalStorage: 10 * 1024 * 1024 * 1024, // 10 GB total
    maxExpiryHours: 30 * 24, // 30 days default
    maxCustomExpiryDays: 365,
    rateLimit: 500,
    imageOnly: false,
    customTtl: true,
  },
} as const;

export const PLAN_PRICES_EUR: Record<PaidTier, number> = {
  pro: 10,
};

export function isPaidTier(tier: Tier): tier is PaidTier {
  return tier === 'pro';
}

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
