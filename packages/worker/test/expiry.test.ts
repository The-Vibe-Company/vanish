import { describe, it, expect } from 'vitest';
import { calculateExpiry, isExpired } from '../src/lib/expiry.js';

describe('calculateExpiry', () => {
  it('returns 48h expiry for anonymous tier', () => {
    const result = calculateExpiry('anonymous');
    expect(result).not.toBeNull();
    const expiry = new Date(result!);
    const now = new Date();
    const diffHours = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);
    // Should be approximately 48 hours (allow 1 minute tolerance)
    expect(diffHours).toBeGreaterThan(47.9);
    expect(diffHours).toBeLessThan(48.1);
  });

  it('returns 30-day expiry for free tier', () => {
    const result = calculateExpiry('free');
    expect(result).not.toBeNull();
    const expiry = new Date(result!);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(29.9);
    expect(diffDays).toBeLessThan(30.1);
  });

  it('returns null (unlimited) for pro tier', () => {
    const result = calculateExpiry('pro');
    expect(result).toBeNull();
  });
});

describe('isExpired', () => {
  it('returns false for null (unlimited)', () => {
    expect(isExpired(null)).toBe(false);
  });

  it('returns false for future date', () => {
    const future = new Date(Date.now() + 60000).toISOString();
    expect(isExpired(future)).toBe(false);
  });

  it('returns true for past date', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    expect(isExpired(past)).toBe(true);
  });
});
