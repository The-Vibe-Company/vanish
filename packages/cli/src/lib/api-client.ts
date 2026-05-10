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
}

export interface ApiError {
  error: string;
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
    upload_bytes?: number;
    site_bytes?: number;
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

export class VanishClient {
  private apiUrl: string;
  private apiKey?: string;

  constructor(config: VanishConfig) {
    this.apiUrl = config.api_url.replace(/\/$/, '');
    this.apiKey = config.api_key;
  }

  async upload(filePath: string, options?: { days?: number }): Promise<UploadResult> {
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

    const response = await fetch(`${this.apiUrl}/upload`, {
      method: 'POST',
      headers,
      body: fileBuffer,
    });

    if (!response.ok) {
      const error = await response.json() as ApiError;
      throw new Error(error.error || `Upload failed with status ${response.status}`);
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
  }): Promise<CreateSiteResult> {
    const response = await fetch(`${this.apiUrl}/sites`, {
      method: 'POST',
      headers: this.jsonHeaders(),
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
  }): Promise<CreateReplacementResult> {
    const response = await fetch(`${this.apiUrl}/sites/${encodeURIComponent(siteIdOrSlug)}/replacements`, {
      method: 'POST',
      headers: this.jsonHeaders(),
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

  async publishSite(siteId: string, token: string): Promise<PublishSiteResult> {
    const headers: Record<string, string> = {
      'X-Site-Token': token,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.apiUrl}/sites/${siteId}/publish`, {
      method: 'POST',
      headers,
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
    options?: { slug?: string; days?: number },
  ): Promise<PublishSiteResult> {
    const headers: Record<string, string> = {
      ...this.jsonHeaders(),
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

  async patchSite(siteIdOrSlug: string, input: { rootPath?: string; slug?: string; days?: number }): Promise<unknown> {
    const response = await fetch(`${this.apiUrl}/sites/${encodeURIComponent(siteIdOrSlug)}`, {
      method: 'PATCH',
      headers: this.jsonHeaders(),
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      await throwApiError(response, 'Failed to update site');
    }

    return response.json();
  }

  async deleteSite(siteId: string, token: string): Promise<void> {
    const headers: Record<string, string> = {
      'X-Site-Token': token,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    await fetch(`${this.apiUrl}/sites/${siteId}`, {
      method: 'DELETE',
      headers,
    });
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

  private jsonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const error = await response.json() as ApiError;
    message = error.error || message;
  } catch {
    message = `${fallback} (status ${response.status})`;
  }
  throw new Error(message);
}
