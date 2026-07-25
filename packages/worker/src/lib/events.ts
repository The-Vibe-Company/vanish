import { nanoid } from 'nanoid';
import type { Env } from '../types.js';

export type ProductEventName =
  | 'site_publish_started'
  | 'site_publish_succeeded'
  | 'site_repeat_publish'
  | 'site_update_used'
  | 'site_first_served'
  | 'login_completed'
  | 'upgrade_clicked'
  | 'upgrade_completed';

type EventValue = string | number | boolean | null;

interface ProductEventInput {
  name: ProductEventName;
  userId?: string | null;
  siteId?: string | null;
  uploadId?: string | null;
  properties?: Record<string, EventValue | undefined>;
}

const SAFE_PROPERTY_KEYS = new Set([
  'tier',
  'target_tier',
  'file_count',
  'total_bytes',
  'max_bytes',
  'is_update',
  'slug_requested',
  'custom_ttl_requested',
  'has_cli_session',
  'has_redirect',
  'secure_cli_flow',
  'checkout_provider',
  'subscription_status',
]);

export function productEventsEnabled(env: Env): boolean {
  return env.PRODUCT_EVENTS === 'true';
}

export async function logProductEvent(env: Env, input: ProductEventInput): Promise<void> {
  if (!productEventsEnabled(env)) {
    return;
  }

  try {
    await env.DB.prepare(`
      INSERT INTO events (id, name, user_id, site_id, upload_id, properties)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      nanoid(16),
      input.name,
      input.userId || null,
      input.siteId || null,
      input.uploadId || null,
      JSON.stringify(safeProperties(input.properties || {})),
    ).run();
  } catch (err) {
    console.error(`Failed to record product event ${input.name}:`, err);
  }
}

export async function hasProductEvent(env: Env, name: ProductEventName, siteId: string): Promise<boolean> {
  if (!productEventsEnabled(env)) {
    return false;
  }

  const event = await env.DB.prepare(`
    SELECT id FROM events
    WHERE name = ? AND site_id = ?
    LIMIT 1
  `).bind(name, siteId).first<{ id: string }>();

  return event !== null;
}

function safeProperties(input: Record<string, EventValue | undefined>): Record<string, EventValue> {
  const properties: Record<string, EventValue> = {};

  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_PROPERTY_KEYS.has(key) || value === undefined) {
      continue;
    }

    properties[key] = value;
  }

  return properties;
}
