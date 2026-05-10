export const RESERVED_SITE_SLUGS = new Set([
  'api',
  'auth',
  'dashboard',
  'f',
  'sites',
  'static',
  'upload',
  'www',
]);

export function normalizeSitePath(input: string): string | null {
  let path = input.trim().replaceAll('\\', '/');

  while (path.startsWith('./')) {
    path = path.slice(2);
  }

  if (!path || path.startsWith('/') || /[\x00-\x1F\x7F]/.test(path)) {
    return null;
  }

  const segments = path.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    return null;
  }

  return segments.join('/');
}

export function normalizeSiteSlug(input: string): string | null {
  const slug = input.trim().toLowerCase();

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    return null;
  }

  if (RESERVED_SITE_SLUGS.has(slug)) {
    return null;
  }

  return slug;
}
