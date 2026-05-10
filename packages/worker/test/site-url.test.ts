import { describe, it, expect } from 'vitest';
import { buildSiteUrl, getSiteIdentifierFromHost, supportsPathSiteUrls } from '../src/lib/site-url.js';

describe('buildSiteUrl', () => {
  it('builds wildcard subdomain URLs for production hosts', () => {
    expect(buildSiteUrl('https://vanish.sh', 'agent-demo')).toBe('https://agent-demo.vanish.sh/');
  });

  it('builds path URLs for local development', () => {
    expect(buildSiteUrl('http://localhost:8787', 'abc123')).toBe('http://localhost:8787/s/abc123/');
  });
});

describe('getSiteIdentifierFromHost', () => {
  it('extracts one-level vanish subdomains', () => {
    expect(getSiteIdentifierFromHost('https://vanish.sh', 'agent-demo.vanish.sh')).toBe('agent-demo');
  });

  it('ignores root, www, and nested subdomains', () => {
    expect(getSiteIdentifierFromHost('https://vanish.sh', 'vanish.sh')).toBeNull();
    expect(getSiteIdentifierFromHost('https://vanish.sh', 'www.vanish.sh')).toBeNull();
    expect(getSiteIdentifierFromHost('https://vanish.sh', 'a.b.vanish.sh')).toBeNull();
  });
});

describe('supportsPathSiteUrls', () => {
  it('only supports path fallback for local hosts', () => {
    expect(supportsPathSiteUrls('http://127.0.0.1:8787')).toBe(true);
    expect(supportsPathSiteUrls('https://vanish.sh')).toBe(false);
  });
});
