import { scryptAsync } from '@noble/hashes/scrypt.js';
import type { Env, SiteAccess } from '../types.js';

const SCRYPT_OPTIONS = {
  N: 2 ** 14,
  r: 8,
  p: 1,
  dkLen: 32,
  asyncTick: 5,
} as const;
const SESSION_SECONDS = 12 * 60 * 60;
const COOKIE_PREFIX = 'vnsh_access_';

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

export async function getSiteAccess(env: Env, siteId: string): Promise<SiteAccess | null> {
  return env.DB.prepare(`
    SELECT site_id, mode, password_hash, password_salt, policy_version, created_at, updated_at
    FROM site_access
    WHERE site_id = ?
  `).bind(siteId).first<SiteAccess>();
}

export async function hasSiteAccess(request: Request, env: Env, access: SiteAccess): Promise<boolean> {
  if (access.mode !== 'password') {
    return true;
  }
  if (!accessProtectionConfigured(env)) {
    return false;
  }

  const cookieName = accessCookieName(access.site_id);
  const token = parseCookies(request.headers.get('Cookie'))[cookieName];
  if (!token) {
    return false;
  }

  return verifyAccessToken(token, access.site_id, access.policy_version, env.ACCESS_SESSION_SECRET!);
}

export function accessProtectionConfigured(env: Env): boolean {
  return Boolean(env.ACCESS_SESSION_SECRET && env.ACCESS_SESSION_SECRET.length >= 32);
}

export async function createAccessCookie(
  siteId: string,
  policyVersion: number,
  secret: string,
): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    siteId,
    policyVersion,
    expires,
  })));
  const signature = await sign(payload, secret);
  return `${accessCookieName(siteId)}=${payload}.${signature}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function renderPasswordGate(siteId: string, returnPath: string, invalid = false): Response {
  const safeReturnPath = sanitizeReturnPath(returnPath);
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
.error{color:#e37b7b}.mark{color:#d4a850}
</style>
</head>
<body><main>
<h1><span class="mark">vanish</span> protected preview</h1>
<p>This handoff is password protected. Enter the shared password to continue.</p>
${invalid ? '<p class="error">That password is not valid.</p>' : ''}
<form method="post" action="/.vanish/access">
<input type="hidden" name="site" value="${escapeHtml(siteId)}">
<input type="hidden" name="return" value="${escapeHtml(safeReturnPath)}">
<label for="password">Password</label>
<input id="password" name="password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required autofocus>
<button type="submit">Open preview</button>
</form>
</main></body></html>`;

  return new Response(html, {
    status: invalid ? 401 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Vanish-Access': 'password-required',
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
  siteId: string,
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
      policyVersion?: number;
      expires?: number;
    };
    return decoded.siteId === siteId &&
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

function accessCookieName(siteId: string): string {
  return `${COOKIE_PREFIX}${siteId.replace(/[^a-zA-Z0-9]/g, '')}`;
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
