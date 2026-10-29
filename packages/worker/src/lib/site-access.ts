import { scryptAsync } from '@noble/hashes/scrypt.js';
import type { AccessMode, AccessPolicy, Env, SiteAccess, Tier, UploadAccess } from '../types.js';
import { isPaidTier } from '../types.js';

const SCRYPT_OPTIONS = {
  N: 2 ** 14,
  r: 8,
  p: 1,
  dkLen: 32,
  asyncTick: 5,
} as const;
const SESSION_SECONDS = 12 * 60 * 60;
const COOKIE_PREFIX = 'vnsh_access_';
const FILE_COOKIE_PREFIX = 'vnsh_file_access_';

export async function hashSitePassword(password: string, salt?: Uint8Array): Promise<{ hash: string; salt: string }> {
  const actualSalt = salt || crypto.getRandomValues(new Uint8Array(16));
  const derived = await scryptAsync(password, actualSalt, SCRYPT_OPTIONS);
  return {
    hash: bytesToBase64Url(derived),
    salt: bytesToBase64Url(actualSalt),
  };
}

export async function verifySitePassword(password: string, expectedHash: string, salt: string): Promise<boolean> {
  const candidate = await hashSitePassword(password, base64UrlToBytes(salt));
  return timingSafeEqual(candidate.hash, expectedHash);
}

export const MAX_ALLOWED_EMAILS = 50;
const EMAIL_PATTERN = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

/** A protected resource: a mini-site, or a file served under /f/. */
export type AccessSubject =
  | { kind: 'site'; id: string }
  | { kind: 'upload'; id: string };

export async function getSiteAccess(env: Env, siteId: string): Promise<SiteAccess | null> {
  return env.DB.prepare(`
    SELECT site_id, mode, password_hash, password_salt, allowed_emails, policy_version, created_at, updated_at
    FROM site_access
    WHERE site_id = ?
  `).bind(siteId).first<SiteAccess>();
}

export async function getUploadAccess(env: Env, uploadId: string): Promise<UploadAccess | null> {
  return env.DB.prepare(`
    SELECT upload_id, mode, password_hash, password_salt, allowed_emails, policy_version, created_at, updated_at
    FROM upload_access
    WHERE upload_id = ?
  `).bind(uploadId).first<UploadAccess>();
}

export async function getAccessPolicy(env: Env, subject: AccessSubject): Promise<AccessPolicy | null> {
  return subject.kind === 'site' ? getSiteAccess(env, subject.id) : getUploadAccess(env, subject.id);
}

export function isProtectedPolicy(policy: AccessPolicy | null | undefined): policy is AccessPolicy {
  return Boolean(policy && policy.mode !== 'link');
}

export async function hasSiteAccess(request: Request, env: Env, access: SiteAccess): Promise<boolean> {
  return hasAccess(request, env, { kind: 'site', id: access.site_id }, access);
}

export async function hasAccess(
  request: Request,
  env: Env,
  subject: AccessSubject,
  policy: AccessPolicy,
): Promise<boolean> {
  if (policy.mode === 'link') {
    return true;
  }
  if (!accessProtectionConfigured(env)) {
    return false;
  }

  const token = parseCookies(request.headers.get('Cookie'))[subjectCookieName(subject)];
  if (!token) {
    return false;
  }

  return verifyAccessToken(token, subject, policy.policy_version, env.ACCESS_SESSION_SECRET!);
}

export function accessProtectionConfigured(env: Env): boolean {
  return Boolean(env.ACCESS_SESSION_SECRET && env.ACCESS_SESSION_SECRET.length >= 32);
}

export function emailAccessConfigured(env: Env): boolean {
  return accessProtectionConfigured(env) && Boolean(env.RESEND_API_KEY && env.ACCESS_EMAIL_FROM);
}

export async function createAccessCookie(
  siteId: string,
  policyVersion: number,
  secret: string,
): Promise<string> {
  return createSubjectAccessCookie({ kind: 'site', id: siteId }, policyVersion, secret);
}

/**
 * Site cookies are host-only with Path=/ (each site has its own host in production).
 * File cookies live on the shared vanish.sh origin, so they are limited to /f/.
 */
export async function createSubjectAccessCookie(
  subject: AccessSubject,
  policyVersion: number,
  secret: string,
): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const claims = subject.kind === 'site'
    ? { siteId: subject.id, policyVersion, expires }
    : { uploadId: subject.id, policyVersion, expires };
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await sign(payload, secret);
  const path = subject.kind === 'site' ? '/' : '/f/';
  return `${subjectCookieName(subject)}=${payload}.${signature}; Path=${path}; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * Validates an owner-supplied allowlist. Accepts an array or a comma/space separated string.
 */
export function parseAllowedEmailsInput(
  input: unknown,
): { ok: true; emails: string[] } | { ok: false; error: string } {
  const list = Array.isArray(input)
    ? input.map(String)
    : typeof input === 'string' ? input.split(/[\s,;]+/) : null;
  if (!list) {
    return { ok: false, error: 'emails must be a list of email addresses' };
  }

  const emails = Array.from(new Set(list.map(normalizeEmail).filter(Boolean)));
  if (emails.length === 0) {
    return { ok: false, error: 'Add at least one allowed email' };
  }
  if (emails.length > MAX_ALLOWED_EMAILS) {
    return { ok: false, error: `At most ${MAX_ALLOWED_EMAILS} allowed emails` };
  }
  const invalid = emails.find(email => !EMAIL_PATTERN.test(email) || email.length > 254);
  if (invalid) {
    return { ok: false, error: `Invalid email: ${invalid}` };
  }
  return { ok: true, emails };
}

export function allowedEmails(policy: AccessPolicy): string[] {
  try {
    const parsed = JSON.parse(policy.allowed_emails || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value) && value.length <= 254;
}

export function renderPasswordGate(siteId: string, returnPath: string, invalid = false): Response {
  return renderAccessGate({ kind: 'site', id: siteId }, 'password', returnPath, invalid ? { error: 'That password is not valid.' } : {});
}

type GateStep = 'password' | 'email' | 'code';

/**
 * Renders the visitor gate. `password` asks for the shared password, `email`
 * asks for an address, `code` asks for the emailed one-time code.
 */
export function renderAccessGate(
  subject: AccessSubject,
  step: GateStep,
  returnPath: string,
  options: { error?: string; email?: string; status?: number } = {},
): Response {
  const safeReturnPath = sanitizeReturnPath(returnPath);
  const hidden = `<input type="hidden" name="${subject.kind === 'site' ? 'site' : 'upload'}" value="${escapeHtml(subject.id)}">
<input type="hidden" name="return" value="${escapeHtml(safeReturnPath)}">`;
  const error = options.error
    ? `<p class="error" id="${step}-error" role="alert">${escapeHtml(options.error)}</p>`
    : '';
  const invalidAttrs = options.error ? ` aria-invalid="true" aria-describedby="${step}-error"` : '';
  const noun = subject.kind === 'site' ? 'handoff' : 'file';

  let intro: string;
  let form: string;
  if (step === 'password') {
    intro = `This ${noun} is password protected. Enter the shared password to continue.`;
    form = `<form method="post" action="/.vanish/access">
${hidden}
<label for="password">Password</label>
<input id="password" name="password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required autofocus${invalidAttrs}>
<button type="submit">Open preview</button>
</form>`;
  } else if (step === 'email') {
    intro = `This ${noun} is shared with specific people. Enter your email to receive a one-time code.`;
    form = `<form method="post" action="/.vanish/access/request-code">
${hidden}
<label for="email">Email</label>
<input id="email" name="email" type="email" maxlength="254" autocomplete="email" required autofocus${invalidAttrs}>
<button type="submit">Send code</button>
</form>`;
  } else {
    intro = `If ${escapeHtml(options.email || 'this address')} is allowed, a 6-digit code is on its way. It expires in 10 minutes.`;
    const emailField = `<input type="hidden" name="email" value="${escapeHtml(options.email || '')}">`;
    form = `<form method="post" action="/.vanish/access/verify-code">
${hidden}
${emailField}
<label for="code">Code</label>
<input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus${invalidAttrs}>
<button type="submit">Open preview</button>
</form>
<form method="post" action="/.vanish/access/request-code" class="secondary">
${hidden}
${emailField}
<button type="submit" class="link">Send a new code</button>
</form>`;
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Protected preview · vanish</title>
<style>
:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#08090a;color:#dee3e9}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
main{width:min(420px,100%);border:1px solid #2b3035;border-radius:10px;padding:28px;background:#0f1113}
h1{font-size:20px;margin:0 0 8px}p{color:#8b929a;font-size:13px;line-height:1.6}
label{display:block;font-size:12px;margin:22px 0 8px}
input{width:100%;padding:12px;border:1px solid #343a40;border-radius:6px;background:#08090a;color:#fff;font:inherit}
button{width:100%;margin-top:12px;padding:12px;border:0;border-radius:6px;background:#d4a850;color:#08090a;font:700 13px inherit;cursor:pointer}
.secondary button.link{background:none;color:#8b929a;font-weight:400;text-decoration:underline;margin-top:4px}
.error{color:#e37b7b}.mark{color:#d4a850}
</style>
</head>
<body><main>
<h1><span class="mark">vanish</span> protected preview</h1>
<p>${intro}</p>
${error}
${form}
</main></body></html>`;

  return new Response(html, {
    status: options.status ?? (options.error ? 401 : 200),
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Vanish-Access': step === 'password' ? 'password-required' : 'email-required',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function sanitizeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\r\n]/.test(value)) {
    return '/';
  }
  return value.slice(0, 2048);
}

async function verifyAccessToken(
  token: string,
  subject: AccessSubject,
  policyVersion: number,
  secret: string,
): Promise<boolean> {
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!timingSafeEqual(await sign(payload, secret), signature)) {
    return false;
  }

  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as {
      siteId?: string;
      uploadId?: string;
      policyVersion?: number;
      expires?: number;
    };
    const subjectMatches = subject.kind === 'site'
      ? decoded.siteId === subject.id && decoded.uploadId === undefined
      : decoded.uploadId === subject.id && decoded.siteId === undefined;
    return subjectMatches &&
      decoded.policyVersion === policyVersion &&
      typeof decoded.expires === 'number' &&
      decoded.expires >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function subjectCookieName(subject: AccessSubject): string {
  const prefix = subject.kind === 'site' ? COOKIE_PREFIX : FILE_COOKIE_PREFIX;
  return `${prefix}${subject.id.replace(/[^a-zA-Z0-9]/g, '')}`;
}

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    cookies[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return cookies;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface AccessInput {
  mode?: unknown;
  password?: unknown;
  emails?: unknown;
}

export type PreparedAccess =
  | { ok: true; statement: D1PreparedStatement; mode: AccessMode }
  | { ok: false; error: string; code: string; status: 400 | 401 | 403 | 503 };

/**
 * Validates an access change and returns the upsert statement. Every change
 * bumps policy_version, which signs out every visitor session issued before.
 * Email allowlists require a paid tier; switching to link or password stays
 * allowed after a downgrade.
 */
export async function prepareAccessPolicy(
  env: Env,
  subject: AccessSubject,
  input: AccessInput,
  tier: Tier | null,
): Promise<PreparedAccess> {
  if (!tier || tier === 'anonymous') {
    return { ok: false, error: 'Access protection requires login', code: 'auth_required', status: 401 };
  }

  const table = subject.kind === 'site' ? 'site_access' : 'upload_access';
  const idColumn = subject.kind === 'site' ? 'site_id' : 'upload_id';
  const upsert = (mode: AccessMode, hash: string | null, salt: string | null, emails: string | null) =>
    env.DB.prepare(`
      INSERT INTO ${table} (${idColumn}, mode, password_hash, password_salt, allowed_emails, policy_version)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(${idColumn}) DO UPDATE SET
        mode = excluded.mode,
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        allowed_emails = excluded.allowed_emails,
        policy_version = ${table}.policy_version + 1,
        updated_at = datetime('now')
    `).bind(subject.id, mode, hash, salt, emails);

  if (input.mode === 'link') {
    return { ok: true, statement: upsert('link', null, null, null), mode: 'link' };
  }

  if (input.mode === 'password') {
    if (!accessProtectionConfigured(env)) {
      return { ok: false, error: 'Password access is not configured on this instance', code: 'access_protection_unavailable', status: 503 };
    }
    if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128) {
      return { ok: false, error: 'password must contain between 8 and 128 characters', code: 'invalid_password', status: 400 };
    }
    const password = await hashSitePassword(input.password);
    return { ok: true, statement: upsert('password', password.hash, password.salt, null), mode: 'password' };
  }

  if (input.mode === 'email') {
    if (!isPaidTier(tier)) {
      return { ok: false, error: 'Email allowlists are only available on Pro', code: 'email_access_requires_pro', status: 403 };
    }
    if (!emailAccessConfigured(env)) {
      return { ok: false, error: 'Email access is not configured on this instance', code: 'email_access_unavailable', status: 503 };
    }
    const parsed = parseAllowedEmailsInput(input.emails);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, code: 'invalid_emails', status: 400 };
    }
    return { ok: true, statement: upsert('email', null, null, JSON.stringify(parsed.emails)), mode: 'email' };
  }

  return { ok: false, error: 'mode must be link, password, or email', code: 'invalid_access_mode', status: 400 };
}

/** Owner-facing description of a policy. Never includes password material. */
export function describeAccess(policy: AccessPolicy | null, includeEmails: boolean) {
  const mode: AccessMode = policy?.mode || 'link';
  const emails = policy && mode === 'email' ? allowedEmails(policy) : [];
  return {
    mode,
    policyVersion: policy?.policy_version || 1,
    passwordConfigured: mode === 'password',
    ...(mode === 'email' ? { emailCount: emails.length } : {}),
    ...(mode === 'email' && includeEmails ? { allowedEmails: emails } : {}),
  };
}
