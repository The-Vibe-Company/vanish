import type { CustomDomain, CustomDomainStatus, Env } from '../types.js';
import { parse as parseDomain } from 'tldts';

export interface DnsRecord {
  type: 'CNAME' | 'TXT';
  name: string;
  value: string;
}

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
}

interface CloudflareCustomHostname {
  id: string;
  hostname: string;
  status?: string;
  ssl?: {
    status?: string;
    validation_records?: Array<{ txt_name?: string; txt_value?: string }>;
  };
  ownership_verification?: {
    type?: string;
    name?: string;
    value?: string;
  };
  verification_errors?: string[];
}

export class DomainProviderError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = 'DomainProviderError';
  }
}

export function customDomainsConfigured(env: Env): boolean {
  return Boolean(
    env.CLOUDFLARE_API_TOKEN &&
    env.CLOUDFLARE_ZONE_ID &&
    env.CUSTOM_DOMAIN_FALLBACK_HOST,
  );
}

export function normalizeCustomHostname(input: string, baseUrl?: string): string | null {
  const candidate = input.trim().toLowerCase().replace(/\.$/, '');
  if (!candidate || candidate.includes('*') || candidate.includes('/') || candidate.includes(':')) {
    return null;
  }
  if (candidate.length > 253) {
    return null;
  }
  const labels = candidate.split('.');
  if (labels.some(label =>
    !label ||
    label.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  )) {
    return null;
  }
  if (labels.at(-1)!.length < 2) {
    return null;
  }
  const parsed = parseDomain(candidate, { allowPrivateDomains: true });
  if (!parsed.domain || !parsed.subdomain || parsed.isIp) {
    return null;
  }
  if (baseUrl) {
    const baseHostname = new URL(baseUrl).hostname.toLowerCase();
    if (candidate === baseHostname || candidate.endsWith(`.${baseHostname}`)) {
      return null;
    }
  }
  return candidate;
}

export function requestCustomHostname(env: Env, hostHeader: string | null): string | null {
  if (!hostHeader || !env.CUSTOM_DOMAIN_FALLBACK_HOST) return null;
  const hostname = stripPort(hostHeader).toLowerCase().replace(/\.$/, '');
  const baseHostname = new URL(env.BASE_URL).hostname.toLowerCase();
  if (
    hostname === baseHostname ||
    hostname === `www.${baseHostname}` ||
    hostname.endsWith(`.${baseHostname}`)
  ) {
    return null;
  }
  return normalizeCustomHostname(hostname, env.BASE_URL);
}

export async function createProviderHostname(
  env: Env,
  hostname: string,
): Promise<{ providerId: string; status: CustomDomainStatus; dnsRecords: DnsRecord[]; error: string | null }> {
  ensureProviderConfigured(env);
  const result = await cloudflareRequest<CloudflareCustomHostname>(env, '', {
    method: 'POST',
    body: JSON.stringify({
      hostname,
      ssl: { method: 'txt', type: 'dv' },
    }),
  });
  return providerState(env, result);
}

export async function getProviderHostname(
  env: Env,
  providerId: string,
): Promise<{ providerId: string; status: CustomDomainStatus; dnsRecords: DnsRecord[]; error: string | null }> {
  ensureProviderConfigured(env);
  const result = await cloudflareRequest<CloudflareCustomHostname>(env, `/${encodeURIComponent(providerId)}`, {
    method: 'GET',
  });
  return providerState(env, result);
}

export async function deleteProviderHostname(env: Env, providerId: string): Promise<void> {
  ensureProviderConfigured(env);
  try {
    await cloudflareRequest<unknown>(env, `/${encodeURIComponent(providerId)}`, { method: 'DELETE' });
  } catch (error) {
    if (error instanceof DomainProviderError && error.status === 404) return;
    throw error;
  }
}

export function domainToJson(domain: CustomDomain): {
  hostname: string;
  channel: string;
  status: CustomDomainStatus;
  dnsRecords: DnsRecord[];
  lastError: string | null;
  verifiedAt: string | null;
  graceExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
} {
  return {
    hostname: domain.hostname,
    channel: domain.channel,
    status: domain.status,
    dnsRecords: parseDnsRecords(domain.dns_records),
    lastError: domain.last_error,
    verifiedAt: domain.verified_at,
    graceExpiresAt: domain.grace_expires_at,
    createdAt: domain.created_at,
    updatedAt: domain.updated_at,
    url: `https://${domain.hostname}/`,
  };
}

export async function syncDomain(env: Env, domain: CustomDomain): Promise<CustomDomain> {
  if (!domain.provider_hostname_id || domain.status === 'suspended' || domain.status === 'deleting') {
    return domain;
  }
  try {
    const provider = await getProviderHostname(env, domain.provider_hostname_id);
    await env.DB.prepare(`
      UPDATE custom_domains
      SET status = ?, dns_records = ?, last_error = ?,
          verified_at = CASE WHEN ? = 'active' THEN COALESCE(verified_at, datetime('now')) ELSE verified_at END,
          updated_at = datetime('now')
      WHERE hostname = ?
    `).bind(
      provider.status,
      JSON.stringify(provider.dnsRecords),
      provider.error,
      provider.status,
      domain.hostname,
    ).run();
    return {
      ...domain,
      status: provider.status,
      dns_records: JSON.stringify(provider.dnsRecords),
      last_error: provider.error,
      verified_at: provider.status === 'active' ? (domain.verified_at || new Date().toISOString()) : domain.verified_at,
      updated_at: new Date().toISOString(),
    };
  } catch (error) {
    const message = providerErrorMessage(error);
    const providerMissing = error instanceof DomainProviderError && error.status === 404;
    await env.DB.prepare(providerMissing ? `
      UPDATE custom_domains
      SET provider_hostname_id = NULL, status = 'error', last_error = ?, updated_at = datetime('now')
      WHERE hostname = ?
    ` : `
      UPDATE custom_domains SET status = 'error', last_error = ?, updated_at = datetime('now')
      WHERE hostname = ?
    `).bind(message, domain.hostname).run();
    return {
      ...domain,
      provider_hostname_id: providerMissing ? null : domain.provider_hostname_id,
      status: 'error',
      last_error: message,
    };
  }
}

export async function beginDomainGrace(env: Env, userId: string): Promise<void> {
  try {
    await env.DB.prepare(`
      UPDATE custom_domains
      SET grace_expires_at = COALESCE(grace_expires_at, datetime('now', '+7 days')),
          updated_at = datetime('now')
      WHERE user_id = ? AND status != 'deleting'
    `).bind(userId).run();
  } catch (error) {
    if (!isMissingCustomDomainsTable(error)) throw error;
  }
}

export async function resumeDomainsAfterUpgrade(env: Env, userId: string): Promise<void> {
  try {
    const result = await env.DB.prepare(`
      SELECT hostname, user_id, channel, provider_hostname_id, status, dns_records, last_error,
             verified_at, grace_expires_at, created_at, updated_at
      FROM custom_domains WHERE user_id = ?
    `).bind(userId).all<CustomDomain>();

    for (const domain of result.results || []) {
      if (domain.status === 'suspended') {
        if (!customDomainsConfigured(env)) {
          await env.DB.prepare(`
            UPDATE custom_domains
            SET status = 'error', grace_expires_at = NULL,
                last_error = 'Custom domain provider is not configured',
                updated_at = datetime('now')
            WHERE hostname = ?
          `).bind(domain.hostname).run();
          continue;
        }
        try {
          const provider = await createProviderHostname(env, domain.hostname);
          await env.DB.prepare(`
            UPDATE custom_domains
            SET provider_hostname_id = ?, status = ?, dns_records = ?, last_error = ?,
                grace_expires_at = NULL, updated_at = datetime('now')
            WHERE hostname = ?
          `).bind(
            provider.providerId,
            provider.status,
            JSON.stringify(provider.dnsRecords),
            provider.error,
            domain.hostname,
          ).run();
        } catch (error) {
          await env.DB.prepare(`
            UPDATE custom_domains
            SET status = 'error', last_error = ?, grace_expires_at = NULL, updated_at = datetime('now')
            WHERE hostname = ?
          `).bind(providerErrorMessage(error), domain.hostname).run();
        }
      } else {
        await env.DB.prepare(`
          UPDATE custom_domains SET grace_expires_at = NULL, updated_at = datetime('now')
          WHERE hostname = ?
        `).bind(domain.hostname).run();
      }
    }
  } catch (error) {
    if (!isMissingCustomDomainsTable(error)) throw error;
  }
}

export async function maintainCustomDomains(env: Env): Promise<void> {
  if (!customDomainsConfigured(env)) return;
  try {
    const expiring = await env.DB.prepare(`
      SELECT hostname, user_id, channel, provider_hostname_id, status, dns_records, last_error,
             verified_at, grace_expires_at, created_at, updated_at
      FROM custom_domains
      WHERE (grace_expires_at IS NOT NULL AND datetime(grace_expires_at) <= datetime('now'))
         OR status = 'deleting'
      LIMIT 100
    `).all<CustomDomain>();

    for (const domain of expiring.results || []) {
      if (domain.provider_hostname_id) {
        try {
          await deleteProviderHostname(env, domain.provider_hostname_id);
        } catch {
          continue;
        }
      }
      if (domain.status === 'deleting') {
        await env.DB.prepare('DELETE FROM custom_domains WHERE hostname = ?').bind(domain.hostname).run();
      } else {
        await env.DB.prepare(`
          UPDATE custom_domains
          SET provider_hostname_id = NULL, status = 'suspended', grace_expires_at = NULL,
              updated_at = datetime('now')
          WHERE hostname = ?
        `).bind(domain.hostname).run();
      }
    }
  } catch (error) {
    if (!isMissingCustomDomainsTable(error)) throw error;
  }
}

function providerState(
  env: Env,
  hostname: CloudflareCustomHostname,
): { providerId: string; status: CustomDomainStatus; dnsRecords: DnsRecord[]; error: string | null } {
  const dnsRecords: DnsRecord[] = [{
    type: 'CNAME',
    name: hostname.hostname,
    value: env.CUSTOM_DOMAIN_FALLBACK_HOST!,
  }];

  const ownership = hostname.ownership_verification;
  if (ownership?.name && ownership.value) {
    dnsRecords.push({
      type: 'TXT',
      name: ownership.name,
      value: ownership.value,
    });
  }
  for (const record of hostname.ssl?.validation_records || []) {
    if (record.txt_name && record.txt_value && !dnsRecords.some(item => item.name === record.txt_name && item.value === record.txt_value)) {
      dnsRecords.push({ type: 'TXT', name: record.txt_name, value: record.txt_value });
    }
  }

  const errors = hostname.verification_errors || [];
  let status: CustomDomainStatus;
  if (errors.length > 0 || hostname.status === 'failed' || hostname.ssl?.status === 'validation_timed_out') {
    status = 'error';
  } else if (hostname.status === 'active' && hostname.ssl?.status === 'active') {
    status = 'active';
  } else if (hostname.status === 'active') {
    status = 'pending_tls';
  } else {
    status = 'pending_dns';
  }

  return {
    providerId: hostname.id,
    status,
    dnsRecords,
    error: errors.length > 0 ? errors.join('; ').slice(0, 500) : null,
  };
}

async function cloudflareRequest<T>(env: Env, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(env.CLOUDFLARE_ZONE_ID!)}/custom_hostnames${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    },
  );
  const payload = await response.json().catch(() => null) as CloudflareEnvelope<T> | null;
  if (!response.ok || !payload?.success) {
    const message = payload?.errors?.map(error => error.message).filter(Boolean).join('; ') ||
      `Cloudflare custom hostname request failed (${response.status})`;
    throw new DomainProviderError(message, response.status);
  }
  return payload.result;
}

function ensureProviderConfigured(env: Env): void {
  if (!customDomainsConfigured(env)) {
    throw new DomainProviderError('Custom domain provisioning is not configured', 503);
  }
}

function parseDnsRecords(value: string): DnsRecord[] {
  try {
    const records = JSON.parse(value);
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function stripPort(host: string): string {
  if (host.startsWith('[')) return host.slice(1, host.indexOf(']'));
  return host.split(':')[0] || host;
}

function providerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Custom domain provider error';
}

function isMissingCustomDomainsTable(error: unknown): boolean {
  return error instanceof Error && /no such table: custom_domains/i.test(error.message);
}
