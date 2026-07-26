import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { VanishConfig } from './config.js';

export interface UploadResult {
  url: string;
  id: string;
  filename: string;
  size: number;
  expires: string | null;
  tier?: string;
  deletable?: boolean;
}

export interface CreateSiteResult {
  id: string;
  token: string;
  url: string;
  name: string;
  rootPath: string;
  slug: string | null;
  fileCount: number;
  maxFiles: number;
  maxBytes: number | null;
  expires: string | null;
}

export interface CreateReplacementResult {
  id: string;
  token: string;
  targetId: string;
  rootPath: string;
  fileCount: number;
  maxFiles: number;
  maxBytes: number | null;
  expires: string | null;
}

export interface PublishSiteResult {
  ok: true;
  id: string;
  url: string;
  rootPath: string;
  size: number;
  fileCount: number;
  expectedFileCount?: number;
  expires: string | null;
  access?: SiteAccessInfo;
}

export interface ApiError {
  error: string;
  code?: string;
  message?: string;
  status?: number;
  hint?: string;
  retryable?: boolean;
  limits?: Record<string, unknown>;
  upgradeRequired?: boolean;
  maxBytes?: number;
  maxTotalBytes?: number;
  usedBytes?: number;
}

export interface MeResult {
  id: string;
  username: string | null;
  email: string | null;
  tier: string;
  created_at: string;
  stats: {
    total_uploads: number;
    total_sites?: number;
    published_sites?: number;
    total_site_drafts?: number;
    total_bundles?: number;
    upload_bytes?: number;
    site_bytes?: number;
    published_site_bytes?: number;
    draft_site_bytes?: number;
    bundle_bytes?: number;
    total_bytes: number;
  };
  limits: {
    maxFileSize: number;
    maxSiteSize?: number;
    maxSiteFiles?: number;
    maxTotalStorage: number | null;
    maxExpiryHours: number;
    imageOnly: boolean;
    customTtl: boolean;
    rateLimit: number;
  };
}

export interface SiteInfo {
  id: string;
  name: string;
  root_path: string;
  slug: string | null;
  size_bytes: number;
  file_count: number;
  expected_file_count: number;
  url: string;
  expires_at: string | null;
  created_at: string;
  last_activity_at?: string;
  published_at: string | null;
  expired: boolean;
  deleted: boolean;
  access_mode?: 'link' | 'password';
}

export interface SiteFileInfo {
  path: string;
  content_type: string | null;
  size_bytes: number;
  created_at: string;
}

export interface KeyInfo {
  prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

export type DomainStatus = 'pending_dns' | 'pending_tls' | 'active' | 'error' | 'suspended' | 'deleting';

export interface DomainInfo {
  hostname: string;
  channel: string;
  status: DomainStatus;
  dnsRecords: Array<{ type: 'CNAME' | 'TXT'; name: string; value: string }>;
  lastError: string | null;
  verifiedAt: string | null;
  graceExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface SiteAccessInfo {
  siteId: string;
  mode: 'link' | 'password';
  policyVersion: number;
  passwordConfigured: boolean;
}

export interface CreateKeyResult {
  api_key: string;
  prefix: string;
  name: string;
  message: string;
}

export interface CreateBundleResult {
  id: string;
  token: string;
  url: string;
  name: string;
  fileCount: number;
  maxFiles: number;
  maxBytes: number | null;
  expires: string | null;
}

export interface PublishBundleResult {
  ok: true;
  id: string;
  url: string;
  size: number;
  fileCount: number;
  expectedFileCount?: number;
  expires: string | null;
}

export interface BundleInfo {
  id: string;
  name: string;
  url: string;
  size_bytes: number;
  file_count: number;
  expected_file_count: number;
  expires_at: string | null;
  created_at: string;
  published_at: string | null;
  expired: boolean;
  deleted: boolean;
  files?: Array<{
    path: string;
    filename: string;
    content_type: string | null;
    size_bytes: number;
    created_at: string;
  }>;
}

interface RequestOptions {
  idempotencyKey?: string;
}

interface PublishSiteOptions extends RequestOptions {
  access?: {
    mode: 'password';
    password: string;
  };
}

export class VanishApiError extends Error {
  code: string;
  status: number;
  hint?: string;
  retryable: boolean;
  limits?: Record<string, unknown>;
  upgradeRequired?: boolean;

  constructor(message: string, input: ApiError & { status?: number }) {
    super(message);
    this.name = 'VanishApiError';
    this.code = input.code || 'api_error';
    this.status = input.status || 0;
    this.hint = input.hint;
    this.retryable = input.retryable ?? false;
    this.limits = input.limits;
    this.upgradeRequired = input.upgradeRequired;
  }
}

export class VanishClient {
  private apiUrl: string;
  private apiKey?: string;

  constructor(config: VanishConfig) {
    this.apiUrl = config.api_url.replace(/\/$/, '');
    this.apiKey = config.api_key;
  }

  get baseUrl(): string {
    return this.apiUrl;
  }

  async upload(filePath: string, options?: { days?: number; idempotencyKey?: string }): Promise<UploadResult> {
    const fileBuffer = readFileSync(filePath);
    const filename = basename(filePath);

    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-Filename': filename,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (options?.days) {
      headers['X-Expires-Days'] = String(options.days);
    }
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(`${this.apiUrl}/upload`, {
      method: 'POST',
      headers,
      body: fileBuffer,
    });

    if (!response.ok) {
      await throwApiError(response, 'Upload failed');
    }

    return response.json() as Promise<UploadResult>;
  }

  async createSite(input: {
    name: string;
    rootPath: string;
    fileCount: number;
    totalBytes: number;
    slug?: string;
    days?: number;
    channel?: string;
  }, options?: RequestOptions): Promise<CreateSiteResult> {
    const response = await fetch(`${this.apiUrl}/sites`, {
      method: 'POST',
      headers: this.jsonHeaders(options),
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to create site');
    }

    return response.json() as Promise<CreateSiteResult>;
  }

  async createSiteReplacement(siteIdOrSlug: string, input: {
    name: string;
    rootPath: string;
    fileCount: number;
    totalBytes: number;
    slug?: string;
    days?: number;
  }, options?: RequestOptions): Promise<CreateReplacementResult> {
    const response = await fetch(`${this.apiUrl}/sites/${encodeURIComponent(siteIdOrSlug)}/replacements`, {
      method: 'POST',
      headers: this.jsonHeaders(options),
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to create site replacement');
    }

    return response.json() as Promise<CreateReplacementResult>;
  }

  async uploadSiteFile(siteId: string, token: string, filePath: string, sitePath: string): Promise<void> {
    const fileBuffer = readFileSync(filePath);
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-Site-Token': token,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.apiUrl}/sites/${siteId}/files?path=${encodeURIComponent(sitePath)}`, {
      method: 'PUT',
      headers,
      body: fileBuffer,
    });

    if (!response.ok) {
      await throwApiError(response, `Failed to upload ${sitePath}`);
    }
  }

  async publishSite(siteId: string, token: string, options?: PublishSiteOptions): Promise<PublishSiteResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Site-Token': token,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(`${this.apiUrl}/sites/${siteId}/publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify(options?.access ? { access: options.access } : {}),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to publish site');
    }

    return response.json() as Promise<PublishSiteResult>;
  }

  async publishSiteReplacement(
    siteIdOrSlug: string,
    draftId: string,
    token: string,
    options?: {
      slug?: string;
      days?: number;
      access?: {
        mode: 'password';
        password: string;
      };
    },
    requestOptions?: RequestOptions,
  ): Promise<PublishSiteResult> {
    const headers: Record<string, string> = {
      ...this.jsonHeaders(requestOptions),
      'X-Site-Token': token,
    };

    const response = await fetch(`${this.apiUrl}/sites/${encodeURIComponent(siteIdOrSlug)}/replacements/${draftId}/publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify(options || {}),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to publish site replacement');
    }

    return response.json() as Promise<PublishSiteResult>;
  }

  async listSites(options: { active?: boolean; limit?: number; offset?: number } = {}): Promise<{ sites: SiteInfo[]; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (options.active !== undefined) params.set('active', String(options.active));
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${this.apiUrl}/sites${query}`, {
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to list sites');
    }

    return response.json() as Promise<{ sites: SiteInfo[]; limit: number; offset: number }>;
  }

  async getSite(siteIdOrSlug: string): Promise<SiteInfo> {
    const response = await fetch(`${this.apiUrl}/sites/${encodeURIComponent(siteIdOrSlug)}`, {
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to get site');
    }

    return response.json() as Promise<SiteInfo>;
  }

  async getSiteFiles(siteIdOrSlug: string): Promise<{ site: SiteInfo; files: SiteFileInfo[] }> {
    const response = await fetch(`${this.apiUrl}/sites/${encodeURIComponent(siteIdOrSlug)}/files`, {
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to list site files');
    }

    return response.json() as Promise<{ site: SiteInfo; files: SiteFileInfo[] }>;
  }

  async getSiteChannel(channel: string): Promise<{ channel: string; site: SiteInfo } | null> {
    const response = await fetch(`${this.apiUrl}/sites/channels/${encodeURIComponent(channel)}`, {
      headers: this.authHeaders(),
    });

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      await throwApiError(response, 'Failed to get site channel');
    }

    return response.json() as Promise<{ channel: string; site: SiteInfo }>;
  }

  async patchSite(siteIdOrSlug: string, input: { rootPath?: string; slug?: string; days?: number }): Promise<SiteInfo> {
    const response = await fetch(`${this.apiUrl}/sites/${encodeURIComponent(siteIdOrSlug)}`, {
      method: 'PATCH',
      headers: this.jsonHeaders(),
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to update site');
    }

    return response.json() as Promise<SiteInfo>;
  }

  async deleteSite(siteId: string, token?: string): Promise<void> {
    const headers: Record<string, string> = {};

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (token) {
      headers['X-Site-Token'] = token;
    }

    const response = await fetch(`${this.apiUrl}/sites/${encodeURIComponent(siteId)}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to delete site');
    }
  }

  async getSiteAccess(siteIdOrSlug: string): Promise<SiteAccessInfo> {
    const response = await fetch(`${this.apiUrl}/sites/${encodeURIComponent(siteIdOrSlug)}/access`, {
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      await throwApiError(response, 'Failed to get site access');
    }
    return response.json() as Promise<SiteAccessInfo>;
  }

  async setSiteAccess(
    siteIdOrSlug: string,
    input: { mode: 'link' } | { mode: 'password'; password: string },
  ): Promise<SiteAccessInfo> {
    const response = await fetch(`${this.apiUrl}/sites/${encodeURIComponent(siteIdOrSlug)}/access`, {
      method: 'PATCH',
      headers: this.jsonHeaders(),
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      await throwApiError(response, 'Failed to update site access');
    }
    return response.json() as Promise<SiteAccessInfo>;
  }

  async createDomain(hostname: string, channel: string): Promise<DomainInfo> {
    const response = await fetch(`${this.apiUrl}/domains`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ hostname, channel }),
    });
    if (!response.ok) {
      await throwApiError(response, 'Failed to add custom domain');
    }
    return response.json() as Promise<DomainInfo>;
  }

  async listDomains(): Promise<{ domains: DomainInfo[]; limit: number }> {
    const response = await fetch(`${this.apiUrl}/domains`, { headers: this.authHeaders() });
    if (!response.ok) {
      await throwApiError(response, 'Failed to list custom domains');
    }
    return response.json() as Promise<{ domains: DomainInfo[]; limit: number }>;
  }

  async getDomain(hostname: string): Promise<DomainInfo> {
    const response = await fetch(`${this.apiUrl}/domains/${encodeURIComponent(hostname)}`, {
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      await throwApiError(response, 'Failed to get custom domain');
    }
    return response.json() as Promise<DomainInfo>;
  }

  async verifyDomain(hostname: string): Promise<DomainInfo> {
    const response = await fetch(`${this.apiUrl}/domains/${encodeURIComponent(hostname)}/verify`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      await throwApiError(response, 'Failed to verify custom domain');
    }
    return response.json() as Promise<DomainInfo>;
  }

  async attachDomain(hostname: string, channel: string): Promise<DomainInfo> {
    const response = await fetch(`${this.apiUrl}/domains/${encodeURIComponent(hostname)}`, {
      method: 'PATCH',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ channel }),
    });
    if (!response.ok) {
      await throwApiError(response, 'Failed to attach custom domain');
    }
    return response.json() as Promise<DomainInfo>;
  }

  async deleteDomain(hostname: string): Promise<{ ok: true; hostname: string; status?: string }> {
    const response = await fetch(`${this.apiUrl}/domains/${encodeURIComponent(hostname)}`, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      await throwApiError(response, 'Failed to remove custom domain');
    }
    return response.json() as Promise<{ ok: true; hostname: string; status?: string }>;
  }

  async listKeys(): Promise<KeyInfo[]> {
    const response = await fetch(`${this.apiUrl}/keys`, {
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to list API keys');
    }

    const data = await response.json() as { keys: KeyInfo[] };
    return data.keys;
  }

  async createKey(name?: string): Promise<CreateKeyResult> {
    const response = await fetch(`${this.apiUrl}/keys`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify(name ? { name } : {}),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to create API key');
    }

    return response.json() as Promise<CreateKeyResult>;
  }

  async revokeKey(prefix: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/keys/${encodeURIComponent(prefix)}`, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to revoke API key');
    }
  }

  async createBundle(input: {
    name: string;
    fileCount: number;
    totalBytes: number;
    days?: number;
  }, options?: RequestOptions): Promise<CreateBundleResult> {
    const response = await fetch(`${this.apiUrl}/bundles`, {
      method: 'POST',
      headers: this.jsonHeaders(options),
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to create bundle');
    }

    return response.json() as Promise<CreateBundleResult>;
  }

  async uploadBundleFile(bundleId: string, token: string, filePath: string, bundlePath: string): Promise<void> {
    const fileBuffer = readFileSync(filePath);
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-Bundle-Token': token,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.apiUrl}/bundles/${bundleId}/files?path=${encodeURIComponent(bundlePath)}`, {
      method: 'PUT',
      headers,
      body: fileBuffer,
    });

    if (!response.ok) {
      await throwApiError(response, `Failed to upload ${bundlePath}`);
    }
  }

  async publishBundle(bundleId: string, token: string, options?: RequestOptions): Promise<PublishBundleResult> {
    const headers: Record<string, string> = {
      'X-Bundle-Token': token,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(`${this.apiUrl}/bundles/${bundleId}/publish`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to publish bundle');
    }

    return response.json() as Promise<PublishBundleResult>;
  }

  async deleteBundle(bundleId: string, token?: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (token) {
      headers['X-Bundle-Token'] = token;
    }

    const response = await fetch(`${this.apiUrl}/bundles/${encodeURIComponent(bundleId)}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to delete bundle');
    }
  }

  async listBundles(options: { active?: boolean; limit?: number; offset?: number } = {}): Promise<{ bundles: BundleInfo[]; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (options.active !== undefined) params.set('active', String(options.active));
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${this.apiUrl}/bundles${query}`, {
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to list bundles');
    }

    return response.json() as Promise<{ bundles: BundleInfo[]; limit: number; offset: number }>;
  }

  async getBundle(bundleId: string): Promise<BundleInfo> {
    const response = await fetch(`${this.apiUrl}/bundles/${encodeURIComponent(bundleId)}`, {
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to get bundle');
    }

    return response.json() as Promise<BundleInfo>;
  }

  async me(): Promise<MeResult> {
    if (!this.apiKey) {
      throw new Error('Authentication required. Use `vanish login` first.');
    }

    const response = await fetch(`${this.apiUrl}/me`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      const error = await response.json() as ApiError;
      throw new Error(error.error || `Failed to fetch user info (status ${response.status})`);
    }

    return response.json() as Promise<MeResult>;
  }

  async health(): Promise<{ status: string; version: string }> {
    const response = await fetch(`${this.apiUrl}/health`);
    return response.json() as Promise<{ status: string; version: string }>;
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private jsonHeaders(options?: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    return headers;
  }
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  let input: ApiError = { error: fallback, status: response.status };
  try {
    const error = await response.json() as ApiError;
    input = { ...error, status: error.status || response.status };
    message = error.message || error.error || message;
  } catch {
    message = `${fallback} (status ${response.status})`;
  }
  throw new VanishApiError(message, input);
}
