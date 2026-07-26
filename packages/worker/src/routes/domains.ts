import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { CustomDomain, DomainReservation, Env, Site } from '../types.js';
import { normalizeSiteSlug } from '../lib/site-path.js';
import {
  adoptOrCreateProviderHostname,
  customDomainsConfigured,
  deleteProviderHostname,
  domainToJson,
  DomainProviderError,
  normalizeCustomHostname,
  normalizeHostname,
  requestCustomHostname,
  syncDomain,
} from '../lib/custom-domains.js';
import { getSiteByChannel, serveSite } from './sites.js';

const domains = new Hono<{ Bindings: Env }>();
const CUSTOM_DOMAIN_LIMIT = 1;
const DOMAIN_ROUTE_LIMIT = 20;

interface DomainTarget {
  hostname: string;
  parentHostname: string | null;
  managedDns: boolean;
}

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
  const target = payload?.hostname
    ? await resolveDomainTarget(c.env, user.id, payload.hostname)
    : null;
  const hostname = target?.hostname || null;
  const channel = payload?.channel?.trim().toLowerCase() || '';
  if (!target || !hostname) {
    return c.json({
      error: 'Use a custom subdomain, or a direct child of a Vanish namespace or custom domain you own',
      code: 'invalid_hostname',
    }, 400);
  }
  if (!channel || !(await getSiteByChannel(c.env, user.id, channel))) {
    return c.json({ error: 'Channel not found', code: 'channel_not_found' }, 404);
  }

  const existingCount = await c.env.DB.prepare(`
    SELECT COUNT(*) AS count FROM custom_domains
    WHERE user_id = ? AND status != 'deleting'
      AND parent_hostname ${target.parentHostname ? 'IS NOT NULL' : 'IS NULL'}
  `).bind(user.id).first<{ count: number }>();
  const targetLimit = target.parentHostname ? DOMAIN_ROUTE_LIMIT : CUSTOM_DOMAIN_LIMIT;
  if ((existingCount?.count || 0) >= targetLimit) {
    return c.json({
      error: target.parentHostname
        ? `The Pro plan includes ${DOMAIN_ROUTE_LIMIT} domain routes`
        : 'The Pro plan includes one custom domain',
      code: target.parentHostname ? 'domain_route_limit_exceeded' : 'domain_limit_exceeded',
      limit: targetLimit,
    }, 409);
  }

  const now = new Date().toISOString();
  try {
    const inserted = await c.env.DB.prepare(`
      INSERT INTO custom_domains (
        hostname, user_id, channel, parent_hostname, managed_dns,
        status, dns_records, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending_dns', '[]', ?, ?)
    `).bind(
      hostname,
      user.id,
      channel,
      target.parentHostname,
      target.managedDns ? 1 : 0,
      now,
      now,
    ).run();
    if (inserted?.meta && inserted.meta.changes !== 1) {
      return c.json({
        error: 'The domain route could not be created because its parent changed',
        code: 'domain_parent_changed',
      }, 409);
    }
  } catch (error) {
    if (isConstraintError(error, 'domain_parent_not_owned')) {
      return c.json({
        error: 'The parent namespace or custom domain is no longer available',
        code: 'domain_parent_changed',
      }, 409);
    }
    const ownedCount = await c.env.DB.prepare(`
      SELECT COUNT(*) AS count FROM custom_domains
      WHERE user_id = ? AND status != 'deleting'
        AND parent_hostname ${target.parentHostname ? 'IS NOT NULL' : 'IS NULL'}
    `).bind(user.id).first<{ count: number }>();
    if ((ownedCount?.count || 0) >= targetLimit) {
      return c.json({
        error: target.parentHostname
          ? `The Pro plan includes ${DOMAIN_ROUTE_LIMIT} domain routes`
          : 'The Pro plan includes one custom domain',
        code: target.parentHostname ? 'domain_route_limit_exceeded' : 'domain_limit_exceeded',
        limit: targetLimit,
      }, 409);
    }
    return c.json({
      error: 'This hostname is already connected to Vanish',
      code: 'hostname_already_exists',
    }, 409);
  }

  try {
    const provider = await adoptOrCreateProviderHostname(c.env, hostname, target.managedDns);
    const persisted = await persistProvisionedHostname(c.env, user.id, hostname, provider);
    if (!persisted) {
      return c.json({
        error: 'Domain creation was cancelled while provisioning',
        code: 'domain_creation_cancelled',
      }, 409);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Custom domain provider error';
    await c.env.DB.prepare(`
      UPDATE custom_domains SET status = 'error', last_error = ?, updated_at = datetime('now')
      WHERE hostname = ? AND user_id = ? AND status != 'deleting'
    `).bind(message, hostname, user.id).run();
  }

  const created = await findOwnedDomain(c.env, user.id, hostname);
  if (!created || created.status === 'deleting') {
    return c.json({
      error: 'Domain creation was cancelled while provisioning',
      code: 'domain_creation_cancelled',
    }, 409);
  }
  return c.json(domainToJson(created!), 201);
});

domains.get('/domains', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);
  const result = await c.env.DB.prepare(`
    SELECT hostname, user_id, channel, parent_hostname, managed_dns, provider_hostname_id, status, dns_records, last_error,
           verified_at, grace_expires_at, created_at, updated_at
    FROM custom_domains
    WHERE user_id = ? AND status != 'deleting'
    ORDER BY created_at DESC
  `).bind(user.id).all<CustomDomain>();
  const reservation = await findReservation(c.env, user.id);
  return c.json({
    domains: (result.results || []).map(domainToJson),
    reservation: reservation ? reservationToJson(reservation) : null,
    limit: CUSTOM_DOMAIN_LIMIT,
    routeLimit: DOMAIN_ROUTE_LIMIT,
  });
});

domains.post('/domains/reservation', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);
  if (user.tier !== 'pro') {
    return c.json({
      error: 'Vanish namespace reservations require the Pro plan',
      code: 'pro_required',
      upgradeRequired: true,
    }, 403);
  }
  const payload = await c.req.json<{ slug?: string }>().catch(() => null);
  const slug = payload?.slug ? normalizeSiteSlug(payload.slug) : null;
  if (!slug) {
    return c.json({
      error: 'Use 1-63 lowercase letters, numbers, or hyphens, and avoid reserved names',
      code: 'invalid_namespace',
    }, 400);
  }
  const baseHostname = canonicalBaseHostname(c.env.BASE_URL);
  const hostname = `${slug}.${baseHostname}`;
  const siteConflict = await c.env.DB.prepare(`
    SELECT id FROM sites
    WHERE (id = ? OR slug = ?) AND deleted_at IS NULL
    LIMIT 1
  `).bind(slug, slug).first<{ id: string }>();
  if (siteConflict) {
    return c.json({
      error: `The namespace "${slug}" is already used by a site`,
      code: 'namespace_already_exists',
    }, 409);
  }
  const now = new Date().toISOString();
  try {
    const inserted = await c.env.DB.prepare(`
      INSERT INTO domain_reservations (hostname, slug, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(hostname, slug, user.id, now, now).run();
    if (inserted?.meta && inserted.meta.changes !== 1) {
      return c.json({
        error: `The namespace "${slug}" was claimed concurrently`,
        code: 'namespace_already_exists',
      }, 409);
    }
  } catch {
    const owned = await findReservation(c.env, user.id);
    return c.json(owned ? {
      error: 'The Pro plan includes one Vanish namespace',
      code: 'namespace_limit_exceeded',
      limit: 1,
      reservation: reservationToJson(owned),
    } : {
      error: `The namespace "${slug}" is already reserved`,
      code: 'namespace_already_exists',
    }, 409);
  }
  return c.json(reservationToJson({
    hostname,
    slug,
    user_id: user.id,
    created_at: now,
    updated_at: now,
  }), 201);
});

domains.delete('/domains/reservation', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);
  const reservation = await findReservation(c.env, user.id);
  if (!reservation) {
    return c.json({ error: 'Vanish namespace not found', code: 'namespace_not_found' }, 404);
  }
  const childCount = await c.env.DB.prepare(`
    SELECT COUNT(*) AS count FROM custom_domains
    WHERE user_id = ? AND parent_hostname = ? AND status != 'deleting'
  `).bind(user.id, reservation.hostname).first<{ count: number }>();
  if ((childCount?.count || 0) > 0) {
    return c.json({
      error: 'Remove every site route in this namespace before releasing it',
      code: 'namespace_not_empty',
    }, 409);
  }
  try {
    const deleted = await c.env.DB.prepare(`
      DELETE FROM domain_reservations WHERE user_id = ? AND hostname = ?
    `).bind(user.id, reservation.hostname).run();
    if (deleted?.meta && deleted.meta.changes !== 1) {
      return c.json({ error: 'Vanish namespace not found', code: 'namespace_not_found' }, 404);
    }
  } catch (error) {
    if (isConstraintError(error, 'domain_parent_not_empty')) {
      return c.json({
        error: 'Remove every site route in this namespace before releasing it',
        code: 'namespace_not_empty',
      }, 409);
    }
    throw error;
  }
  return c.json({ ok: true, hostname: reservation.hostname });
});

domains.get('/domains/:hostname', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required', code: 'auth_required' }, 401);
  const hostname = normalizeHostname(c.req.param('hostname'));
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
  const hostname = normalizeHostname(c.req.param('hostname'));
  const domain = hostname ? await findOwnedDomain(c.env, user.id, hostname) : null;
  if (!domain) return c.json({ error: 'Domain not found', code: 'domain_not_found' }, 404);
  if (domain.status === 'suspended') {
    return c.json({ error: 'Upgrade to Pro to reactivate this domain', code: 'pro_required' }, 403);
  }
  if (!domain.provider_hostname_id) {
    try {
      const provider = await adoptOrCreateProviderHostname(c.env, domain.hostname, domain.managed_dns === 1);
      const persisted = await persistProvisionedHostname(c.env, user.id, domain.hostname, provider);
      if (!persisted) {
        return c.json({
          error: 'Domain verification was cancelled while the domain was being removed',
          code: 'domain_creation_cancelled',
        }, 409);
      }
      const reprovisioned = await findOwnedDomain(c.env, user.id, domain.hostname);
      if (!reprovisioned || reprovisioned.status === 'deleting') {
        return c.json({
          error: 'Domain verification was cancelled while the domain was being removed',
          code: 'domain_creation_cancelled',
        }, 409);
      }
      return c.json(domainToJson(reprovisioned));
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Custom domain provider error';
      await c.env.DB.prepare(`
        UPDATE custom_domains SET status = 'error', last_error = ?, updated_at = datetime('now')
        WHERE hostname = ? AND user_id = ? AND status != 'deleting'
      `).bind(message, domain.hostname, user.id).run();
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
  const hostname = normalizeHostname(c.req.param('hostname'));
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
  const hostname = normalizeHostname(c.req.param('hostname'));
  const domain = hostname ? await findOwnedDomain(c.env, user.id, hostname) : null;
  if (!domain) return c.json({ error: 'Domain not found', code: 'domain_not_found' }, 404);
  if (!domain.parent_hostname) {
    const childCount = await c.env.DB.prepare(`
      SELECT COUNT(*) AS count FROM custom_domains
      WHERE user_id = ? AND parent_hostname = ? AND status != 'deleting'
    `).bind(user.id, hostname).first<{ count: number }>();
    if ((childCount?.count || 0) > 0) {
      return c.json({
        error: 'Remove every child route before removing this custom domain',
        code: 'domain_not_empty',
      }, 409);
    }
  }

  try {
    const marked = await c.env.DB.prepare(`
      UPDATE custom_domains
      SET status = 'deleting', updated_at = datetime('now')
      WHERE hostname = ? AND user_id = ? AND status != 'deleting'
    `).bind(hostname, user.id).run();
    if (marked?.meta && marked.meta.changes !== 1) {
      const current = await findOwnedDomain(c.env, user.id, hostname!);
      if (!current) {
        return c.json({ error: 'Domain not found', code: 'domain_not_found' }, 404);
      }
      return c.json({ ok: true, hostname, status: 'deleting' }, 202);
    }
  } catch (error) {
    if (isConstraintError(error, 'domain_parent_not_empty')) {
      return c.json({
        error: 'Remove every child route before removing this custom domain',
        code: 'domain_not_empty',
      }, 409);
    }
    throw error;
  }
  if (domain.provider_hostname_id) {
    try {
      await deleteProviderHostname(c.env, domain.provider_hostname_id);
    } catch (error) {
      if (!(error instanceof DomainProviderError)) throw error;
      return c.json({ ok: true, hostname, status: 'deleting' }, 202);
    }
  } else {
    return c.json({ ok: true, hostname, status: 'deleting' }, 202);
  }
  await c.env.DB.prepare(`
    DELETE FROM custom_domains WHERE hostname = ? AND user_id = ? AND status = 'deleting'
  `).bind(hostname, user.id).run();
  return c.json({ ok: true, hostname });
});

async function findOwnedDomain(env: Env, userId: string, hostname: string): Promise<CustomDomain | null> {
  return env.DB.prepare(`
    SELECT hostname, user_id, channel, parent_hostname, managed_dns, provider_hostname_id, status, dns_records, last_error,
           verified_at, grace_expires_at, created_at, updated_at
    FROM custom_domains
    WHERE user_id = ? AND hostname = ?
  `).bind(userId, hostname).first<CustomDomain>();
}

type ProvisionedHostname = Awaited<ReturnType<typeof adoptOrCreateProviderHostname>>;

async function persistProvisionedHostname(
  env: Env,
  userId: string,
  hostname: string,
  provider: ProvisionedHostname,
): Promise<boolean> {
  const committed = await env.DB.prepare(`
    UPDATE custom_domains
    SET provider_hostname_id = ?, status = ?, dns_records = ?, last_error = ?,
        verified_at = CASE WHEN ? = 'active' THEN datetime('now') ELSE NULL END,
        updated_at = datetime('now')
    WHERE hostname = ? AND user_id = ? AND status != 'deleting'
  `).bind(
    provider.providerId,
    provider.status,
    JSON.stringify(provider.dnsRecords),
    provider.error,
    provider.status,
    hostname,
    userId,
  ).run();
  if (committed.meta?.changes !== 0) return true;

  const queued = await env.DB.prepare(`
    UPDATE custom_domains
    SET provider_hostname_id = ?, last_error = 'Provisioning completed after deletion was requested',
        updated_at = datetime('now')
    WHERE hostname = ? AND user_id = ? AND status = 'deleting'
  `).bind(provider.providerId, hostname, userId).run();
  if (queued.meta?.changes === 1) return false;

  await deleteProviderHostname(env, provider.providerId);
  return false;
}

async function resolveDomainTarget(env: Env, userId: string, input: string): Promise<DomainTarget | null> {
  const hostname = normalizeHostname(input);
  if (!hostname) return null;

  const baseHostname = canonicalBaseHostname(env.BASE_URL);
  if (hostname.endsWith(`.${baseHostname}`)) {
    const relativeLabels = hostname.slice(0, -(baseHostname.length + 1)).split('.');
    if (relativeLabels.length !== 2) return null;
    const parentHostname = `${relativeLabels[1]}.${baseHostname}`;
    const reservation = await env.DB.prepare(`
      SELECT hostname FROM domain_reservations WHERE user_id = ? AND hostname = ?
    `).bind(userId, parentHostname).first<Pick<DomainReservation, 'hostname'>>();
    return reservation ? { hostname, parentHostname, managedDns: true } : null;
  }

  if (!normalizeCustomHostname(hostname, env.BASE_URL)) return null;
  const parentHostname = hostname.split('.').slice(1).join('.');
  const ownedParent = await env.DB.prepare(`
    SELECT hostname FROM custom_domains
    WHERE user_id = ? AND hostname = ? AND parent_hostname IS NULL AND status != 'deleting'
  `).bind(userId, parentHostname).first<Pick<CustomDomain, 'hostname'>>();
  return {
    hostname,
    parentHostname: ownedParent?.hostname || null,
    managedDns: false,
  };
}

async function findReservation(env: Env, userId: string): Promise<DomainReservation | null> {
  return env.DB.prepare(`
    SELECT hostname, slug, user_id, created_at, updated_at
    FROM domain_reservations WHERE user_id = ?
  `).bind(userId).first<DomainReservation>();
}

function reservationToJson(reservation: DomainReservation) {
  return {
    hostname: reservation.hostname,
    slug: reservation.slug,
    url: `https://${reservation.hostname}/`,
    createdAt: reservation.created_at,
    updatedAt: reservation.updated_at,
  };
}

function canonicalBaseHostname(baseUrl: string): string {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

function isConstraintError(error: unknown, marker: string): boolean {
  return error instanceof Error && error.message.includes(marker);
}

export default domains;
