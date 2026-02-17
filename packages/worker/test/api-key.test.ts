import { describe, it, expect } from 'vitest';
import { generateApiKey, getKeyPrefix, hashApiKey } from '../src/lib/api-key.js';

describe('generateApiKey', () => {
  it('starts with vnsh_ prefix', () => {
    const key = generateApiKey();
    expect(key.startsWith('vnsh_')).toBe(true);
  });

  it('has correct length (5 prefix + 43 random = 48)', () => {
    const key = generateApiKey();
    expect(key.length).toBe(48);
  });

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
    expect(keys.size).toBe(100);
  });
});

describe('getKeyPrefix', () => {
  it('returns first 15 chars (vnsh_ + 10 random)', () => {
    const key = 'vnsh_abcdefghij1234567890ABCDEFGHIJKLMNOPQRSTU';
    const prefix = getKeyPrefix(key);
    expect(prefix).toBe('vnsh_abcdefghij');
    expect(prefix.length).toBe(15);
  });
});

describe('hashApiKey', () => {
  it('returns a 64-char hex string', async () => {
    const hash = await hashApiKey('vnsh_test123');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const hash1 = await hashApiKey('vnsh_samekey');
    const hash2 = await hashApiKey('vnsh_samekey');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different keys', async () => {
    const hash1 = await hashApiKey('vnsh_key1');
    const hash2 = await hashApiKey('vnsh_key2');
    expect(hash1).not.toBe(hash2);
  });
});
