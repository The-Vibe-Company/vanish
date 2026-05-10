const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function buildSiteUrl(baseUrl: string, identifier: string): string {
  const url = new URL(baseUrl);

  if (isLocalHostname(url.hostname)) {
    return `${url.origin}/s/${identifier}/`;
  }

  return `${url.protocol}//${identifier}.${url.host}/`;
}

export function getSiteIdentifierFromHost(baseUrl: string, hostHeader: string | null): string | null {
  if (!hostHeader) return null;

  const base = new URL(baseUrl);
  const baseHostname = stripWww(base.hostname.toLowerCase());
  const requestHostname = stripPort(hostHeader).toLowerCase();

  if (requestHostname === baseHostname || requestHostname === `www.${baseHostname}`) {
    return null;
  }

  if (!requestHostname.endsWith(`.${baseHostname}`)) {
    return null;
  }

  const label = requestHostname.slice(0, -(baseHostname.length + 1));
  if (!label || label.includes('.')) {
    return null;
  }

  return label;
}

export function supportsPathSiteUrls(baseUrl: string): boolean {
  return isLocalHostname(new URL(baseUrl).hostname);
}

function stripPort(host: string): string {
  if (host.startsWith('[')) {
    return host.slice(1, host.indexOf(']'));
  }
  return host.split(':')[0] || host;
}

function stripWww(hostname: string): string {
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}
