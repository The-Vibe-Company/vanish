import type { Env, User } from '../types.js';
import { getRateLimitIdentifier } from './rate-limit.js';

export interface StructuredErrorOptions {
  hint?: string;
  retryable?: boolean;
  limits?: Record<string, unknown>;
  upgradeRequired?: boolean;
}

export function structuredError(
  code: string,
  message: string,
  status: number,
  options: StructuredErrorOptions = {},
): Record<string, unknown> {
  return {
    error: message,
    code,
    message,
    status,
    retryable: options.retryable ?? false,
    ...(options.hint ? { hint: options.hint } : {}),
    ...(options.limits ? { limits: options.limits } : {}),
    ...(options.upgradeRequired !== undefined ? { upgradeRequired: options.upgradeRequired } : {}),
  };
}

export function getIdempotencyKey(request: Request): string | null {
  const key = request.headers.get('Idempotency-Key') || request.headers.get('X-Idempotency-Key');
  if (!key) {
    return null;
  }

  const trimmed = key.trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function getIdempotencyOwner(
  user: User | null,
  connectingIp: string | null,
  forwardedFor: string | null,
): string {
  if (user) {
    return `user:${user.id}`;
  }

  return `anonymous:${getRateLimitIdentifier(null, connectingIp, forwardedFor)}`;
}

export async function getIdempotentReplay(
  env: Env,
  scope: string,
  owner: string,
  key: string,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const row = await env.DB.prepare(`
    SELECT status, response_json
    FROM idempotency_keys
    WHERE scope = ?
      AND owner = ?
      AND idempotency_key = ?
      AND datetime(expires_at) > datetime('now')
  `).bind(scope, owner, key).first<{ status: number; response_json: string }>();

  if (!row) {
    return null;
  }

  try {
    return {
      status: row.status,
      body: {
        ...(JSON.parse(row.response_json) as Record<string, unknown>),
        idempotentReplay: true,
      },
    };
  } catch {
    return null;
  }
}

export async function reserveIdempotencyKey(
  env: Env,
  scope: string,
  owner: string,
  key: string,
): Promise<{ ok: true } | { ok: false; status: number; body: Record<string, unknown> }> {
  await env.DB.prepare(`
    DELETE FROM idempotency_keys
    WHERE scope = ?
      AND owner = ?
      AND idempotency_key = ?
      AND datetime(expires_at) <= datetime('now')
  `).bind(scope, owner, key).run();

  const inProgressBody = structuredError(
    'idempotency_in_progress',
    'A request with this idempotency key is still processing. Retry shortly.',
    409,
    { retryable: true },
  );

  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO idempotency_keys (scope, owner, idempotency_key, status, response_json, expires_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', '+10 minutes'))
  `).bind(scope, owner, key, 409, JSON.stringify(inProgressBody)).run();

  if ((inserted.meta?.changes || 0) > 0) {
    return { ok: true };
  }

  const replay = await getIdempotentReplay(env, scope, owner, key);
  return replay
    ? { ok: false, status: replay.status, body: replay.body }
    : { ok: false, status: 409, body: inProgressBody };
}

export async function completeIdempotentResponse(
  env: Env,
  scope: string,
  owner: string,
  key: string,
  status: number,
  body: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(`
    UPDATE idempotency_keys
    SET status = ?,
        response_json = ?,
        expires_at = datetime('now', '+48 hours')
    WHERE scope = ?
      AND owner = ?
      AND idempotency_key = ?
      AND status = 409
  `).bind(status, JSON.stringify(body), scope, owner, key).run();
}

export async function clearIdempotencyReservation(
  env: Env,
  scope: string,
  owner: string,
  key: string,
): Promise<void> {
  await env.DB.prepare(`
    DELETE FROM idempotency_keys
    WHERE scope = ?
      AND owner = ?
      AND idempotency_key = ?
      AND status = 409
  `).bind(scope, owner, key).run();
}
