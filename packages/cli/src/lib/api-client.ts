import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { VanishConfig } from './config.js';

export interface UploadResult {
  url: string;
  id: string;
  filename: string;
  size: number;
  expires: string | null;
}

export interface ApiError {
  error: string;
  maxBytes?: number;
}

export interface MeResult {
  id: string;
  username: string | null;
  email: string | null;
  tier: string;
  created_at: string;
  stats: {
    total_uploads: number;
    total_bytes: number;
  };
  limits: {
    maxFileSize: number;
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
}
