import { describe, it, expect } from 'vitest';
import { getRateLimitIdentifier } from '../src/lib/rate-limit.js';

describe('getRateLimitIdentifier', () => {
  it('uses user.id for authenticated users', () => {
    expect(getRateLimitIdentifier({ id: 'usr_abc' }, '1.2.3.4', null)).toBe('usr_abc');
  });

  it('ignores IP when user is authenticated', () => {
    expect(getRateLimitIdentifier({ id: 'usr_abc' }, '9.9.9.9', '8.8.8.8')).toBe('usr_abc');
  });

  it('uses CF-Connecting-IP for anonymous users', () => {
    expect(getRateLimitIdentifier(null, '1.2.3.4', null)).toBe('ip:1.2.3.4');
  });

  it('falls back to X-Forwarded-For first entry', () => {
    expect(getRateLimitIdentifier(null, null, '5.6.7.8, 10.0.0.1')).toBe('ip:5.6.7.8');
  });

  it('falls back to unknown when no IP available', () => {
    expect(getRateLimitIdentifier(null, null, null)).toBe('ip:unknown');
  });
});
