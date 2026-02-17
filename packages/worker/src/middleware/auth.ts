import { createMiddleware } from 'hono/factory';
import type { Env, Tier, User } from '../types.js';
import { hashApiKey } from '../lib/api-key.js';

// Extend Hono context with user info
declare module 'hono' {
  interface ContextVariableMap {
    user: User | null;
    tier: Tier;
  }
}

/**
 * Auth middleware: extracts API key from Authorization header,
 * looks up user in D1, sets tier accordingly.
 * Does NOT reject unauthenticated requests — they get tier='anonymous'.
 */
export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    c.set('user', null);
    c.set('tier', 'anonymous');
    return next();
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey.startsWith('vnsh_')) {
    c.set('user', null);
    c.set('tier', 'anonymous');
    return next();
  }

  const keyHash = await hashApiKey(apiKey);

  const result = await c.env.DB.prepare(`
    SELECT u.id, u.github_id, u.email, u.github_username, u.tier,
           u.stripe_customer_id, u.stripe_subscription_id, u.created_at, u.updated_at
    FROM api_keys ak
    JOIN users u ON ak.user_id = u.id
    WHERE ak.key_hash = ? AND ak.revoked_at IS NULL
  `).bind(keyHash).first<User>();

  if (!result) {
    c.set('user', null);
    c.set('tier', 'anonymous');
    return next();
  }

  // Update last_used_at (fire-and-forget, don't block the request)
  c.executionCtx.waitUntil(
    c.env.DB.prepare('UPDATE api_keys SET last_used_at = datetime(\'now\') WHERE key_hash = ?')
      .bind(keyHash).run()
  );

  c.set('user', result);
  c.set('tier', result.tier as Tier);
  return next();
});

export { hashApiKey } from '../lib/api-key.js';
