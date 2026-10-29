import { Hono } from 'hono';
import type { Context } from 'hono';
import { customAlphabet, nanoid } from 'nanoid';
import type { AccessPolicy, Env, Upload } from '../types.js';
import { getRateLimitIdentifier } from '../lib/rate-limit.js';
import { hashApiKey } from '../lib/api-key.js';
import { isExpired } from '../lib/expiry.js';
import { sendAccessCodeEmail } from '../lib/email.js';
import {
  accessProtectionConfigured,
  allowedEmails,
  createSubjectAccessCookie,
  describeAccess,
  emailAccessConfigured,
  getAccessPolicy,
  isValidEmail,
  normalizeEmail,
  prepareAccessPolicy,
  renderAccessGate,
  sanitizeReturnPath,
  verifySitePassword,
  type AccessSubject,
} from '../lib/site-access.js';
import { getSiteByIdentifier } from './sites.js';

type AppContext = Context<{ Bindings: Env }>;

const accessRoutes = new Hono<{ Bindings: Env }>();

const ACCESS_CODE = customAlphabet('0123456789', 6);
const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const CODE_REQUESTS_PER_EMAIL_HOUR = 5;
const CODE_REQUESTS_PER_IP_HOUR = 20;

accessRoutes.get('/sites/:id/access', async (c) => {
  const owned = await getOwnedSubject(c, 'site');
  if (!owned.ok) return c.json({ error: owned.error, code: owned.code }, owned.status);

  return c.json({ siteId: owned.subject.id, ...describeAccess(await getAccessPolicy(c.env, owned.subject), true) });
});

accessRoutes.patch('/sites/:id/access', async (c) => {
  const owned = await getOwnedSubject(c, 'site');
  if (!owned.ok) return c.json({ error: owned.error, code: owned.code }, owned.status);
  if (!owned.published) return c.json({ error: 'Publish the site before changing access', code: 'site_not_published' }, 409);

  return updateAccess(c, owned.subject);
});

accessRoutes.get('/uploads/:id/access', async (c) => {
  const owned = await getOwnedSubject(c, 'upload');
  if (!owned.ok) return c.json({ error: owned.error, code: owned.code }, owned.status);

  return c.json({ uploadId: owned.subject.id, ...describeAccess(await getAccessPolicy(c.env, owned.subject), true) });
});

accessRoutes.patch('/uploads/:id/access', async (c) => {
  const owned = await getOwnedSubject(c, 'upload');
  if (!owned.ok) return c.json({ error: owned.error, code: owned.code }, owned.status);

  return updateAccess(c, owned.subject);
});

accessRoutes.post('/.vanish/access', async (c) => {
  const contentType = c.req.header('Content-Type') || '';
  const isJson = contentType.includes('application/json');
  const fields = await readAccessFields(c, ['site', 'upload', 'password', 'return']);
  if (!fields) {
    return c.json({ error: 'site, upload, password, and return must be strings', code: 'invalid_request' }, 400);
  }

  const subject = subjectFromFields(fields);
  const returnPath = sanitizeReturnPath(fields.return || defaultReturnPath(subject));
  const password = fields.password || '';

  const access = subject ? await getLiveAccess(c, subject) : null;
  if (!subject || !access || access.mode !== 'password' || !access.password_hash || !access.password_salt) {
    return c.json({ error: 'Protected site not found', code: 'protected_site_not_found' }, 404);
  }
  if (!accessProtectionConfigured(c.env)) {
    return c.json({ error: 'Password access is unavailable', code: 'access_protection_unavailable' }, 503);
  }
  if (password.length < 8 || password.length > 128) {
    if (isJson) {
      return c.json({
        error: 'password must contain between 8 and 128 characters',
        code: 'invalid_password',
      }, 400);
    }
    return renderAccessGate(subject, 'password', returnPath, { error: 'That password is not valid.' });
  }

  const passwordAction = subject.kind === 'site' ? `site-password:${subject.id}` : `upload-password:${subject.id}`;
  if (!(await reserveRateLimit(c, clientIdentifier(c), passwordAction, 10, '-15 minutes'))) {
    return c.json({ error: 'Too many password attempts', code: 'rate_limit_exceeded' }, 429);
  }

  const valid = await verifySitePassword(password, access.password_hash, access.password_salt);
  if (!valid) {
    if (isJson) {
      return c.json({ error: 'Invalid password', code: 'invalid_password' }, 401);
    }
    return renderAccessGate(subject, 'password', returnPath, { error: 'That password is not valid.' });
  }

  return signedIn(c, subject, access, returnPath, isJson);
});

/**
 * Sends a one-time code to an allowlisted address. The response is identical
 * whether or not the address is on the list, so the allowlist stays private.
 */
accessRoutes.post('/.vanish/access/request-code', async (c) => {
  const isJson = (c.req.header('Content-Type') || '').includes('application/json');
  const fields = await readAccessFields(c, ['site', 'upload', 'email', 'return']);
  if (!fields) {
    return c.json({ error: 'site, upload, email, and return must be strings', code: 'invalid_request' }, 400);
  }

  const subject = subjectFromFields(fields);
  const returnPath = sanitizeReturnPath(fields.return || defaultReturnPath(subject));
  const access = subject ? await getLiveAccess(c, subject) : null;
  if (!subject || !access || access.mode !== 'email') {
    return c.json({ error: 'Protected site not found', code: 'protected_site_not_found' }, 404);
  }
  if (!emailAccessConfigured(c.env)) {
    return c.json({ error: 'Email access is unavailable', code: 'email_access_unavailable' }, 503);
  }

  const email = normalizeEmail(fields.email || '');
  if (!isValidEmail(email)) {
    if (isJson) return c.json({ error: 'Enter a valid email address', code: 'invalid_email' }, 400);
    return renderAccessGate(subject, 'email', returnPath, { error: 'Enter a valid email address.', status: 400 });
  }

  const emailHash = await hashApiKey(email);
  const scope = `${subject.kind}:${subject.id}`;
  const ipAllowed = await reserveRateLimit(c, clientIdentifier(c), 'access-code-ip', CODE_REQUESTS_PER_IP_HOUR, '-1 hour');
  const emailAllowed = ipAllowed && await reserveRateLimit(c, `email:${emailHash}`, `access-code:${scope}`, CODE_REQUESTS_PER_EMAIL_HOUR, '-1 hour');
  if (!ipAllowed || !emailAllowed) {
    if (isJson) return c.json({ error: 'Too many codes requested', code: 'rate_limit_exceeded' }, 429);
    return renderAccessGate(subject, 'email', returnPath, { error: 'Too many codes requested. Try again later.', status: 429 });
  }

  // Do the same work for every address (a code row is stored either way and
  // verify-code re-checks the allowlist), and send the email in the background,
  // so neither timing nor delivery errors reveal who is on the list.
  const code = ACCESS_CODE();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
  await c.env.DB.prepare(`
    INSERT INTO access_codes (id, resource_type, resource_id, email_hash, code_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(nanoid(), subject.kind, subject.id, emailHash, await hashCode(subject, email, code), expiresAt).run();

  if (allowedEmails(access).includes(email)) {
    c.executionCtx.waitUntil(
      subjectLabel(c, subject)
        .then(label => sendAccessCodeEmail(c.env, { to: email, code, label, minutes: CODE_TTL_MINUTES }))
        .catch(err => {
          console.error('Failed to send access code email:', err instanceof Error ? err.message : err);
        }),
    );
  }

  if (isJson) return c.json({ ok: true });
  return renderAccessGate(subject, 'code', returnPath, { email });
});

accessRoutes.post('/.vanish/access/verify-code', async (c) => {
  const isJson = (c.req.header('Content-Type') || '').includes('application/json');
  const fields = await readAccessFields(c, ['site', 'upload', 'email', 'code', 'return']);
  if (!fields) {
    return c.json({ error: 'site, upload, email, code, and return must be strings', code: 'invalid_request' }, 400);
  }

  const subject = subjectFromFields(fields);
  const returnPath = sanitizeReturnPath(fields.return || defaultReturnPath(subject));
  const access = subject ? await getLiveAccess(c, subject) : null;
  if (!subject || !access || access.mode !== 'email') {
    return c.json({ error: 'Protected site not found', code: 'protected_site_not_found' }, 404);
  }
  if (!accessProtectionConfigured(c.env)) {
    return c.json({ error: 'Email access is unavailable', code: 'email_access_unavailable' }, 503);
  }

  const email = normalizeEmail(fields.email || '');
  const code = (fields.code || '').replace(/\s+/g, '');
  const emailHash = await hashApiKey(email);
  const row = await c.env.DB.prepare(`
    SELECT id, code_hash, attempts, expires_at
    FROM access_codes
    WHERE resource_type = ? AND resource_id = ? AND email_hash = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(subject.kind, subject.id, emailHash).first<{ id: string; code_hash: string; attempts: number; expires_at: string }>();

  // Reserve an attempt atomically before comparing, so parallel guesses
  // cannot exceed MAX_CODE_ATTEMPTS.
  const reserved = row && new Date(row.expires_at) > new Date()
    ? await c.env.DB.prepare(`
      UPDATE access_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ?
    `).bind(row.id, MAX_CODE_ATTEMPTS).run()
    : null;
  if (!row || (reserved?.meta?.changes || 0) !== 1) {
    if (isJson) return c.json({ error: 'This code has expired', code: 'code_expired' }, 401);
    return renderAccessGate(subject, 'email', returnPath, { error: 'This code has expired. Request a new one.' });
  }

  const matches = row.code_hash === await hashCode(subject, email, code);
  if (!matches || !allowedEmails(access).includes(email)) {
    if (isJson) return c.json({ error: 'Invalid code', code: 'invalid_code' }, 401);
    return renderAccessGate(subject, 'code', returnPath, { email, error: 'That code is not valid.' });
  }

  await c.env.DB.prepare(`
    DELETE FROM access_codes WHERE resource_type = ? AND resource_id = ? AND email_hash = ?
  `).bind(subject.kind, subject.id, emailHash).run();

  return signedIn(c, subject, access, returnPath, isJson);
});

async function updateAccess(c: AppContext, subject: AccessSubject): Promise<Response> {
  const payload = await c.req.json<{ mode?: unknown; password?: unknown; emails?: unknown }>().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return c.json({ error: 'mode must be link, password, or email', code: 'invalid_access_mode' }, 400);
  }

  const prepared = await prepareAccessPolicy(c.env, subject, payload, c.get('user')?.tier || null);
  if (!prepared.ok) {
    return c.json({ error: prepared.error, code: prepared.code }, prepared.status);
  }

  await c.env.DB.batch([
    prepared.statement,
    c.env.DB.prepare('DELETE FROM access_codes WHERE resource_type = ? AND resource_id = ?').bind(subject.kind, subject.id),
  ]);

  const idField = subject.kind === 'site' ? { siteId: subject.id } : { uploadId: subject.id };
  return c.json({ ...idField, ...describeAccess(await getAccessPolicy(c.env, subject), true) });
}

async function signedIn(
  c: AppContext,
  subject: AccessSubject,
  access: AccessPolicy,
  returnPath: string,
  isJson: boolean,
): Promise<Response> {
  const cookie = await createSubjectAccessCookie(subject, access.policy_version, c.env.ACCESS_SESSION_SECRET!);
  if (isJson) {
    c.header('Set-Cookie', cookie);
    return c.json({ ok: true, return: returnPath });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: returnPath,
      'Set-Cookie': cookie,
      'Cache-Control': 'private, no-store',
    },
  });
}

async function getOwnedSubject(
  c: AppContext,
  kind: 'site' | 'upload',
): Promise<
  | { ok: true; subject: AccessSubject; published: boolean }
  | { ok: false; error: string; code: string; status: 401 | 403 | 404 }
> {
  const user = c.get('user');
  if (!user) return { ok: false, error: 'Authentication required', code: 'auth_required', status: 401 };

  if (kind === 'site') {
    const site = await getSiteByIdentifier(c.env, c.req.param('id') || '');
    if (!site) return { ok: false, error: 'Site not found', code: 'site_not_found', status: 404 };
    if (site.user_id !== user.id) return { ok: false, error: 'Not authorized', code: 'forbidden', status: 403 };
    return { ok: true, subject: { kind: 'site', id: site.id }, published: Boolean(site.published_at) };
  }

  const upload = await getLiveUpload(c.env, (c.req.param('id') || '').replace(/\.[^.]+$/, ''));
  if (!upload) return { ok: false, error: 'File not found', code: 'file_not_found', status: 404 };
  if (upload.user_id !== user.id) return { ok: false, error: 'Not authorized', code: 'forbidden', status: 403 };
  return { ok: true, subject: { kind: 'upload', id: upload.id }, published: true };
}

async function getLiveUpload(env: Env, id: string): Promise<Upload | null> {
  const upload = await env.DB.prepare(`
    SELECT * FROM uploads WHERE id = ? AND deleted_at IS NULL
  `).bind(id).first<Upload>();
  return upload && !isExpired(upload.expires_at) ? upload : null;
}

/** Access policy of a resource that can still be served. */
async function getLiveAccess(c: AppContext, subject: AccessSubject): Promise<AccessPolicy | null> {
  if (subject.kind === 'upload' && !(await getLiveUpload(c.env, subject.id))) {
    return null;
  }
  return getAccessPolicy(c.env, subject);
}

async function subjectLabel(c: AppContext, subject: AccessSubject): Promise<string> {
  if (subject.kind === 'upload') {
    return (await getLiveUpload(c.env, subject.id))?.filename || 'a shared file';
  }
  const site = await getSiteByIdentifier(c.env, subject.id);
  return site?.name || site?.slug || 'a shared site';
}

function subjectFromFields(fields: Record<string, string | undefined>): AccessSubject | null {
  if (fields.site && !fields.upload) return { kind: 'site', id: fields.site };
  if (fields.upload && !fields.site) return { kind: 'upload', id: fields.upload };
  return null;
}

function defaultReturnPath(subject: AccessSubject | null): string {
  return subject?.kind === 'upload' ? `/f/${subject.id}` : '/';
}

/**
 * Reads string fields from a JSON or form body. Returns null when a JSON
 * field has the wrong type.
 */
async function readAccessFields(
  c: AppContext,
  names: string[],
): Promise<Record<string, string | undefined> | null> {
  const fields: Record<string, string | undefined> = {};
  if ((c.req.header('Content-Type') || '').includes('application/json')) {
    const payload = await c.req.json<unknown>().catch(() => null);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    for (const name of names) {
      const value = (payload as Record<string, unknown>)[name];
      if (value !== undefined && typeof value !== 'string') return null;
      fields[name] = value as string | undefined;
    }
    return fields;
  }

  const form = await c.req.formData().catch(() => null);
  for (const name of names) {
    const value = form?.get(name);
    fields[name] = typeof value === 'string' ? value : undefined;
  }
  return fields;
}

function clientIdentifier(c: AppContext): string {
  return getRateLimitIdentifier(
    null,
    c.req.header('CF-Connecting-IP') || null,
    c.req.header('X-Forwarded-For') || null,
  );
}

/** Atomically records an attempt unless the window already holds `limit` attempts. */
async function reserveRateLimit(
  c: AppContext,
  identifier: string,
  action: string,
  limit: number,
  window: string,
): Promise<boolean> {
  const reservation = await c.env.DB.prepare(`
    INSERT INTO rate_limits (identifier, action)
    SELECT ?, ?
    WHERE (
      SELECT COUNT(*)
      FROM rate_limits
      WHERE identifier = ? AND action = ? AND created_at > datetime('now', ?)
    ) < ?
  `).bind(identifier, action, identifier, action, window, limit).run();
  return (reservation.meta?.changes || 0) === 1;
}

async function hashCode(subject: AccessSubject, email: string, code: string): Promise<string> {
  return hashApiKey(`${subject.kind}:${subject.id}:${email}:${code}`);
}

export default accessRoutes;
