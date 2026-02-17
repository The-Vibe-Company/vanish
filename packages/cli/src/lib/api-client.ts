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

export class VanishClient {
  private apiUrl: string;
  private apiKey?: string;

  constructor(config: VanishConfig) {
    this.apiUrl = config.api_url.replace(/\/$/, '');
    this.apiKey = config.api_key;
  }

  async upload(filePath: string): Promise<UploadResult> {
    const fileBuffer = readFileSync(filePath);
    const filename = basename(filePath);

    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-Filename': filename,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
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

  async health(): Promise<{ status: string; version: string }> {
    const response = await fetch(`${this.apiUrl}/health`);
    return response.json() as Promise<{ status: string; version: string }>;
  }
}
