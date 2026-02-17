import { describe, it, expect } from 'vitest';
import { TIER_LIMITS, BLOCKED_EXTENSIONS } from '../src/types.js';

describe('TIER_LIMITS', () => {
  it('anonymous tier allows 2MB', () => {
    expect(TIER_LIMITS.anonymous.maxFileSize).toBe(2 * 1024 * 1024);
  });

  it('free tier allows 50MB', () => {
    expect(TIER_LIMITS.free.maxFileSize).toBe(50 * 1024 * 1024);
  });

  it('pro tier allows 1GB', () => {
    expect(TIER_LIMITS.pro.maxFileSize).toBe(1024 * 1024 * 1024);
  });

  it('anonymous tier expires in 48 hours', () => {
    expect(TIER_LIMITS.anonymous.maxExpiryHours).toBe(48);
  });

  it('free tier expires in 30 days', () => {
    expect(TIER_LIMITS.free.maxExpiryHours).toBe(30 * 24);
  });

  it('pro tier has unlimited expiry', () => {
    expect(TIER_LIMITS.pro.maxExpiryHours).toBeNull();
  });
});

describe('BLOCKED_EXTENSIONS', () => {
  it('blocks executable extensions', () => {
    expect(BLOCKED_EXTENSIONS.has('.exe')).toBe(true);
    expect(BLOCKED_EXTENSIONS.has('.sh')).toBe(true);
    expect(BLOCKED_EXTENSIONS.has('.bat')).toBe(true);
    expect(BLOCKED_EXTENSIONS.has('.ps1')).toBe(true);
  });

  it('does not block image extensions', () => {
    expect(BLOCKED_EXTENSIONS.has('.png')).toBe(false);
    expect(BLOCKED_EXTENSIONS.has('.jpg')).toBe(false);
    expect(BLOCKED_EXTENSIONS.has('.webp')).toBe(false);
  });
});
