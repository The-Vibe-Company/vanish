import { describe, it, expect } from 'vitest';
import { normalizeSitePath, normalizeSiteSlug } from '../src/lib/site-path.js';

describe('normalizeSitePath', () => {
  it('accepts relative paths inside a site folder', () => {
    expect(normalizeSitePath('index.html')).toBe('index.html');
    expect(normalizeSitePath('./docs/README.md')).toBe('docs/README.md');
    expect(normalizeSitePath('assets\\app.js')).toBe('assets/app.js');
  });

  it('rejects absolute and traversal paths', () => {
    expect(normalizeSitePath('/index.html')).toBeNull();
    expect(normalizeSitePath('../index.html')).toBeNull();
    expect(normalizeSitePath('assets/../index.html')).toBeNull();
    expect(normalizeSitePath('assets/bad\nname.css')).toBeNull();
    expect(normalizeSitePath('assets/bad\rname.css')).toBeNull();
    expect(normalizeSitePath('')).toBeNull();
  });
});

describe('normalizeSiteSlug', () => {
  it('accepts dns-safe slugs', () => {
    expect(normalizeSiteSlug('Agent-Demo')).toBe('agent-demo');
    expect(normalizeSiteSlug('demo123')).toBe('demo123');
  });

  it('rejects invalid and reserved slugs', () => {
    expect(normalizeSiteSlug('-demo')).toBeNull();
    expect(normalizeSiteSlug('demo-')).toBeNull();
    expect(normalizeSiteSlug('demo_site')).toBeNull();
    expect(normalizeSiteSlug('www')).toBeNull();
    expect(normalizeSiteSlug('sites')).toBeNull();
  });
});
