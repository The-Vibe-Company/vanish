import { describe, it, expect } from 'vitest';
import { TIER_LIMITS, BLOCKED_EXTENSIONS, ALLOWED_IMAGE_EXTENSIONS } from '../src/types.js';

describe('TIER_LIMITS', () => {
  it('anonymous tier allows 5MB', () => {
    expect(TIER_LIMITS.anonymous.maxFileSize).toBe(5 * 1024 * 1024);
  });

  it('anonymous tier allows 10MB mini-sites', () => {
    expect(TIER_LIMITS.anonymous.maxSiteSize).toBe(10 * 1024 * 1024);
    expect(TIER_LIMITS.anonymous.maxSiteFiles).toBe(100);
  });

  it('free tier allows 50MB', () => {
    expect(TIER_LIMITS.free.maxFileSize).toBe(50 * 1024 * 1024);
  });

  it('pro tier allows 1GB', () => {
    expect(TIER_LIMITS.pro.maxFileSize).toBe(1024 * 1024 * 1024);
  });

  it('anonymous tier has no total storage limit', () => {
    expect(TIER_LIMITS.anonymous.maxTotalStorage).toBeNull();
  });

  it('free tier has 50MB total storage', () => {
    expect(TIER_LIMITS.free.maxTotalStorage).toBe(50 * 1024 * 1024);
    expect(TIER_LIMITS.free.maxSiteSize).toBe(50 * 1024 * 1024);
    expect(TIER_LIMITS.free.maxSiteFiles).toBe(500);
  });

  it('pro tier has 10GB total storage', () => {
    expect(TIER_LIMITS.pro.maxTotalStorage).toBe(10 * 1024 * 1024 * 1024);
    expect(TIER_LIMITS.pro.maxSiteSize).toBe(10 * 1024 * 1024 * 1024);
    expect(TIER_LIMITS.pro.maxSiteFiles).toBe(5000);
    expect(TIER_LIMITS.pro.rateLimit).toBe(500);
  });

  it('anonymous tier expires in 24 hours', () => {
    expect(TIER_LIMITS.anonymous.maxExpiryHours).toBe(24);
  });

  it('free tier expires in 48 hours', () => {
    expect(TIER_LIMITS.free.maxExpiryHours).toBe(48);
  });

  it('pro tier expires in 30 days by default', () => {
    expect(TIER_LIMITS.pro.maxExpiryHours).toBe(30 * 24);
  });

  it('anonymous tier is image-only', () => {
    expect(TIER_LIMITS.anonymous.imageOnly).toBe(true);
  });

  it('free tier allows all files', () => {
    expect(TIER_LIMITS.free.imageOnly).toBe(false);
  });

  it('pro tier allows all files', () => {
    expect(TIER_LIMITS.pro.imageOnly).toBe(false);
  });

  it('pro allows custom TTL', () => {
    expect(TIER_LIMITS.anonymous.customTtl).toBe(false);
    expect(TIER_LIMITS.free.customTtl).toBe(false);
    expect(TIER_LIMITS.pro.customTtl).toBe(true);
  });

  it('pro tier max custom TTL is 365 days', () => {
    expect(TIER_LIMITS.pro.maxCustomExpiryDays).toBe(365);
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

describe('ALLOWED_IMAGE_EXTENSIONS', () => {
  it('allows common image extensions', () => {
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.png')).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.jpg')).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.jpeg')).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.gif')).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.webp')).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.svg')).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.avif')).toBe(true);
  });

  it('does not allow non-image extensions', () => {
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.pdf')).toBe(false);
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.json')).toBe(false);
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.zip')).toBe(false);
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.txt')).toBe(false);
    expect(ALLOWED_IMAGE_EXTENSIONS.has('.exe')).toBe(false);
  });
});
