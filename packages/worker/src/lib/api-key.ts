import { nanoid } from 'nanoid';

const API_KEY_PREFIX = 'vnsh_';

/**
 * Generate a new API key: vnsh_ + 43 random chars (base62-like via nanoid).
 * ~256 bits of entropy.
 */
export function generateApiKey(): string {
  return API_KEY_PREFIX + nanoid(43);
}

/**
 * Get the visible prefix of an API key (first 10 chars after vnsh_)
 * for display in key listings without exposing the full key.
 */
export function getKeyPrefix(apiKey: string): string {
  return apiKey.slice(0, API_KEY_PREFIX.length + 10);
}

/**
 * SHA-256 hash of an API key for storage.
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
