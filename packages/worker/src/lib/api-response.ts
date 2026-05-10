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
      AND expires_at > datetime('now')
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

export async function saveIdempotentResponse(
  env: Env,
  scope: string,
  owner: string,
  key: string | null,
  status: number,
  body: Record<string, unknown>,
): Promise<void> {
  if (!key) {
    return;
  }

  await env.DB.prepare(`
    DELETE FROM idempotency_keys
    WHERE scope = ?
      AND owner = ?
      AND idempotency_key = ?
      AND expires_at <= datetime('now')
  `).bind(scope, owner, key).run();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO idempotency_keys (scope, owner, idempotency_key, status, response_json, expires_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', '+48 hours'))
  `).bind(scope, owner, key, status, JSON.stringify(body)).run();
}
