import { describe, it, expect } from 'vitest';
import { calculateExpiry, isExpired } from '../src/lib/expiry.js';

describe('calculateExpiry', () => {
  it('returns 24h expiry for anonymous tier', () => {
    const result = calculateExpiry('anonymous');
    expect(result).not.toBeNull();
    const expiry = new Date(result);
    const now = new Date();
    const diffHours = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeGreaterThan(23.9);
    expect(diffHours).toBeLessThan(24.1);
  });

  it('returns 48h expiry for free tier', () => {
    const result = calculateExpiry('free');
    expect(result).not.toBeNull();
    const expiry = new Date(result);
    const now = new Date();
    const diffHours = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeGreaterThan(47.9);
    expect(diffHours).toBeLessThan(48.1);
  });

  it('returns 30-day expiry for pro tier by default', () => {
    const result = calculateExpiry('pro');
    expect(result).not.toBeNull();
    const expiry = new Date(result);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(29.9);
    expect(diffDays).toBeLessThan(30.1);
  });

  it('allows custom TTL for pro tier', () => {
    const result = calculateExpiry('pro', 7);
    const expiry = new Date(result);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it('clamps custom TTL to 365 days max', () => {
    const result = calculateExpiry('pro', 999);
    const expiry = new Date(result);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(364.9);
    expect(diffDays).toBeLessThan(365.1);
  });

  it('clamps custom TTL to minimum 1 day', () => {
    const result = calculateExpiry('pro', 0);
    const expiry = new Date(result);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(0.9);
    expect(diffDays).toBeLessThan(1.1);
  });

  it('ignores custom TTL for non-pro tiers', () => {
    const result = calculateExpiry('free', 7);
    const expiry = new Date(result);
    const now = new Date();
    const diffHours = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);
    // Should still be 48h, not 7 days
    expect(diffHours).toBeGreaterThan(47.9);
    expect(diffHours).toBeLessThan(48.1);
  });
});

describe('isExpired', () => {
  it('returns false for null (legacy unlimited)', () => {
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
