import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { CustomDomain, Env, Site } from '../types.js';
import {
  createProviderHostname,
  customDomainsConfigured,
  deleteProviderHostname,
  domainToJson,
  DomainProviderError,
  normalizeCustomHostname,
  requestCustomHostname,
  syncDomain,
} from '../lib/custom-domains.js';
import { getSiteByChannel, serveSite } from './sites.js';

const domains = new Hono<{ Bindings: Env }>();

export const customDomainMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();
  const hostname = requestCustomHostname(c.env, c.req.header('Host') || new URL(c.req.url).host);
  if (!hostname) return next();

  const result = await c.env.DB.prepare(`
    SELECT s.id
    FROM custom_domains d
    JOIN site_channels sc ON sc.user_id = d.user_id AND sc.channel = d.channel
    JOIN sites s ON s.id = sc.site_id
    WHERE d.hostname = ?
      AND d.status = 'active'
      AND s.deleted_at IS NULL
      AND s.published_at IS NOT NULL
    LIMIT 1
  `).bind(hostname).first<Pick<Site, 'id'>>();

  if (!result) {
    return c.html(`<!doctype html><html><head><meta name="robots" content="noindex"><title>No active preview</title></head><body style="font:16px system-ui;max-width:600px;margin:15vh auto;padding:24px"><h1>No active preview</h1><p>This Vanish domain is ready, but its channel has no active handoff.</p></body></html>`, 404);
  }

  return serveSite(c, result.id, new URL(c.req.url).pathname);
});

domains.post('/domains', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);
  if (user.tier !== 'pro') {
    return c.json({
      error: 'Custom domains require the Pro plan',
      code: 'pro_required',
      upgradeRequired: true,
    }, 403);
  }
  if (!customDomainsConfigured(c.env)) {
    return c.json({
      error: 'Custom domain provisioning is not configured on this instance',
      code: 'domain_provisioning_unavailable',
    }, 503);
  }

  const payload = await c.req.json<{ hostname?: string; channel?: string }>().catch(() => null);
  const hostname = payload?.hostname ? normalizeCustomHostname(payload.hostname, c.env.BASE_URL) : null;
  const channel = payload?.channel?.trim().toLowerCase() || '';
  if (!hostname) {
    return c.json({
      error: 'Use a valid subdomain such as preview.example.com; apex domains are not supported yet',
      code: 'invalid_hostname',
    }, 400);
  }
  if (!channel || !(await getSiteByChannel(c.env, user.id, channel))) {
    return c.json({ error: 'Channel not found', code: 'channel_not_found' }, 404);
  }

  const existingCount = await c.env.DB.prepare(`
    SELECT COUNT(*) AS count FROM custom_domains
    WHERE user_id = ? AND status != 'deleting'
  `).bind(user.id).first<{ count: number }>();
  if ((existingCount?.count || 0) >= 1) {
    return c.json({
      error: 'The Pro plan includes one custom domain',
      code: 'domain_limit_exceeded',
      limit: 1,
    }, 409);
  }

  const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(`
      INSERT INTO custom_domains (
        hostname, user_id, channel, status, dns_records, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending_dns', '[]', ?, ?)
    `).bind(hostname, user.id, channel, now, now).run();
  } catch (error) {
    const ownedCount = await c.env.DB.prepare(`
      SELECT COUNT(*) AS count FROM custom_domains
      WHERE user_id = ? AND status != 'deleting'
    `).bind(user.id).first<{ count: number }>();
    if ((ownedCount?.count || 0) >= 1) {
      return c.json({
        error: 'The Pro plan includes one custom domain',
        code: 'domain_limit_exceeded',
        limit: 1,
      }, 409);
    }
    return c.json({
      error: 'This hostname is already connected to Vanish',
      code: 'hostname_already_exists',
    }, 409);
  }

  try {
    const provider = await createProviderHostname(c.env, hostname);
    await c.env.DB.prepare(`
      UPDATE custom_domains
      SET provider_hostname_id = ?, status = ?, dns_records = ?, last_error = ?,
          verified_at = CASE WHEN ? = 'active' THEN datetime('now') ELSE NULL END,
          updated_at = datetime('now')
      WHERE hostname = ?
    `).bind(
      provider.providerId,
      provider.status,
      JSON.stringify(provider.dnsRecords),
      provider.error,
      provider.status,
      hostname,
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Custom domain provider error';
    await c.env.DB.prepare(`
      UPDATE custom_domains SET status = 'error', last_error = ?, updated_at = datetime('now')
      WHERE hostname = ?
    `).bind(message, hostname).run();
  }

  const created = await findOwnedDomain(c.env, user.id, hostname);
  return c.json(domainToJson(created!), 201);
});

domains.get('/domains', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);
  const result = await c.env.DB.prepare(`
    SELECT hostname, user_id, channel, provider_hostname_id, status, dns_records, last_error,
           verified_at, grace_expires_at, created_at, updated_at
    FROM custom_domains
    WHERE user_id = ? AND status != 'deleting'
    ORDER BY created_at DESC
  `).bind(user.id).all<CustomDomain>();
  return c.json({ domains: (result.results || []).map(domainToJson), limit: 1 });
});

domains.get('/domains/:hostname', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);
  const hostname = normalizeCustomHostname(c.req.param('hostname'), c.env.BASE_URL);
  const domain = hostname ? await findOwnedDomain(c.env, user.id, hostname) : null;
  if (!domain) return c.json({ error: 'Domain not found', code: 'domain_not_found' }, 404);
  const synced = domain.status === 'pending_dns' || domain.status === 'pending_tls' || domain.status === 'error'
    ? await syncDomain(c.env, domain)
    : domain;
  return c.json(domainToJson(synced));
});

domains.post('/domains/:hostname/verify', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);
  const hostname = normalizeCustomHostname(c.req.param('hostname'), c.env.BASE_URL);
  const domain = hostname ? await findOwnedDomain(c.env, user.id, hostname) : null;
  if (!domain) return c.json({ error: 'Domain not found', code: 'domain_not_found' }, 404);
  if (domain.status === 'suspended') {
    return c.json({ error: 'Upgrade to Pro to reactivate this domain', code: 'pro_required' }, 403);
  }
  if (!domain.provider_hostname_id) {
    try {
      const provider = await createProviderHostname(c.env, domain.hostname);
      await c.env.DB.prepare(`
        UPDATE custom_domains
        SET provider_hostname_id = ?, status = ?, dns_records = ?, last_error = ?,
            verified_at = CASE WHEN ? = 'active' THEN datetime('now') ELSE NULL END,
            updated_at = datetime('now')
        WHERE hostname = ?
      `).bind(
        provider.providerId,
        provider.status,
        JSON.stringify(provider.dnsRecords),
        provider.error,
        provider.status,
        domain.hostname,
      ).run();
      const reprovisioned = await findOwnedDomain(c.env, user.id, domain.hostname);
      return c.json(domainToJson(reprovisioned!));
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Custom domain provider error';
      await c.env.DB.prepare(`
        UPDATE custom_domains SET status = 'error', last_error = ?, updated_at = datetime('now')
        WHERE hostname = ?
      `).bind(message, domain.hostname).run();
      return c.json({
        ...domainToJson({ ...domain, status: 'error', last_error: message }),
      }, 502);
    }
  }
  return c.json(domainToJson(await syncDomain(c.env, domain)));
});

domains.patch('/domains/:hostname', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);
  const hostname = normalizeCustomHostname(c.req.param('hostname'), c.env.BASE_URL);
  const domain = hostname ? await findOwnedDomain(c.env, user.id, hostname) : null;
  if (!domain) return c.json({ error: 'Domain not found', code: 'domain_not_found' }, 404);
  const payload = await c.req.json<{ channel?: string }>().catch(() => null);
  const channel = payload?.channel?.trim().toLowerCase() || '';
  if (!channel || !(await getSiteByChannel(c.env, user.id, channel))) {
    return c.json({ error: 'Channel not found', code: 'channel_not_found' }, 404);
  }
  await c.env.DB.prepare(`
    UPDATE custom_domains SET channel = ?, updated_at = datetime('now') WHERE hostname = ?
  `).bind(channel, hostname).run();
  return c.json(domainToJson({ ...domain, channel, updated_at: new Date().toISOString() }));
});

domains.delete('/domains/:hostname', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);
  const hostname = normalizeCustomHostname(c.req.param('hostname'), c.env.BASE_URL);
  const domain = hostname ? await findOwnedDomain(c.env, user.id, hostname) : null;
  if (!domain) return c.json({ error: 'Domain not found', code: 'domain_not_found' }, 404);

  await c.env.DB.prepare(`
    UPDATE custom_domains SET status = 'deleting', updated_at = datetime('now') WHERE hostname = ?
  `).bind(hostname).run();
  if (domain.provider_hostname_id) {
    try {
      await deleteProviderHostname(c.env, domain.provider_hostname_id);
    } catch (error) {
      if (!(error instanceof DomainProviderError)) throw error;
      return c.json({ ok: true, hostname, status: 'deleting' }, 202);
    }
  }
  await c.env.DB.prepare('DELETE FROM custom_domains WHERE hostname = ?').bind(hostname).run();
  return c.json({ ok: true, hostname });
});

async function findOwnedDomain(env: Env, userId: string, hostname: string): Promise<CustomDomain | null> {
  return env.DB.prepare(`
    SELECT hostname, user_id, channel, provider_hostname_id, status, dns_records, last_error,
           verified_at, grace_expires_at, created_at, updated_at
    FROM custom_domains
    WHERE user_id = ? AND hostname = ?
  `).bind(userId, hostname).first<CustomDomain>();
}

export default domains;
