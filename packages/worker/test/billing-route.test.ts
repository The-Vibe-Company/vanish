import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashApiKey } from '../src/lib/api-key.js';
import type { Env, Tier, User } from '../src/types.js';

describe('billing routes', () => {
  let db: BillingDB;
  let env: Env;

  beforeEach(() => {
    db = new BillingDB();
    env = {
      DB: db as unknown as D1Database,
      BUCKET: {} as R2Bucket,
      BASE_URL: 'https://vanish.sh',
      SELF_HOSTED: 'false',
      DEFAULT_TIER: 'free',
      PRODUCT_EVENTS: 'true',
      STRIPE_SECRET_KEY: 'sk_test_secret',
      STRIPE_PRICE_ID: 'price_test',
      STRIPE_PRO_PRICE_ID_EUR_10: 'price_pro_eur_10',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records upgrade clicks without storing checkout-sensitive data', async () => {
    const apiKey = await addUser(db, 'user1', 'free');
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = String(init?.body);
      expect(body).toContain('metadata%5Bvanish_user_id%5D=user1');
      expect(body).toContain('subscription_data%5Bmetadata%5D%5Bvanish_user_id%5D=user1');
      expect(body).toContain('metadata%5Bvanish_tier%5D=pro');
      return Response.json({ id: 'cs_test', url: 'https://stripe.test/checkout' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(env, '/billing/checkout', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://stripe.test/checkout');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(db.events).toEqual([
      expect.objectContaining({
        name: 'upgrade_clicked',
        user_id: 'user1',
        properties: JSON.stringify({ tier: 'free', target_tier: 'pro', checkout_provider: 'stripe' }),
      }),
    ]);
    expect(db.events[0].properties).not.toContain('price_test');
  });

  it('creates a Pro checkout and returns JSON to the dashboard', async () => {
    const apiKey = await addUser(db, 'user1', 'free');
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = String(init?.body);
      expect(body).toContain('line_items%5B0%5D%5Bprice%5D=price_pro_eur_10');
      expect(body).toContain('metadata%5Bvanish_tier%5D=pro');
      expect(body).toContain('subscription_data%5Bmetadata%5D%5Bvanish_tier%5D=pro');
      return Response.json({ id: 'cs_pro', url: 'https://stripe.test/pro-checkout' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(env, '/billing/checkout?tier=pro', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://stripe.test/pro-checkout' });
  });

  it('records completed upgrades without leaking Stripe customer identifiers', async () => {
    await addUser(db, 'user1', 'free');
    const user = db.users.get('user1')!;
    const body = JSON.stringify({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { vanish_user_id: 'user1' },
          customer: 'cus_test',
          subscription: 'sub_test',
        },
      },
    });
    const signature = await createStripeSignature(body, env.STRIPE_WEBHOOK_SECRET!);

    const response = await request(env, '/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': signature },
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(user.tier).toBe('pro');
    expect(user.stripe_customer_id).toBe('cus_test');
    expect(user.stripe_subscription_id).toBe('sub_test');
    expect(db.events).toEqual([
      expect.objectContaining({
        name: 'upgrade_completed',
        user_id: 'user1',
        properties: JSON.stringify({
          tier: 'pro',
          checkout_provider: 'stripe',
          subscription_status: 'active',
        }),
      }),
    ]);
    expect(db.events[0].properties).not.toContain('cus_test');
    expect(db.events[0].properties).not.toContain('sub_test');

    const retry = await request(env, '/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': signature },
      body,
    });
    expect(retry.status).toBe(200);
    expect(db.events).toHaveLength(1);
  });

  it('creates billing portal sessions through bearer auth without URL keys', async () => {
    const apiKey = await addUser(db, 'user1', 'pro', {
      stripe_customer_id: 'cus_test',
      stripe_subscription_id: 'sub_test',
    });
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = String(init?.body);
      expect(body).toContain('customer=cus_test');
      expect(body).toContain('return_url=https%3A%2F%2Fvanish.sh%2Fdashboard%23billing');
      expect(body).not.toContain('vnsh_');
      return Response.json({ url: 'https://stripe.test/portal' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(env, '/billing/portal', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://stripe.test/portal' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('records subscription-created upgrades from subscription metadata', async () => {
    await addUser(db, 'user1', 'free');
    const user = db.users.get('user1')!;
    const body = JSON.stringify({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test',
          status: 'active',
          customer: 'cus_test',
          metadata: { vanish_user_id: 'user1' },
        },
      },
    });
    const signature = await createStripeSignature(body, env.STRIPE_WEBHOOK_SECRET!);

    const response = await request(env, '/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': signature },
      body,
    });

    expect(response.status).toBe(200);
    expect(user.tier).toBe('pro');
    expect(user.stripe_customer_id).toBe('cus_test');
    expect(user.stripe_subscription_id).toBe('sub_test');
    expect(db.events).toEqual([
      expect.objectContaining({
        name: 'upgrade_completed',
        user_id: 'user1',
        properties: JSON.stringify({
          tier: 'pro',
          checkout_provider: 'stripe',
          subscription_status: 'active',
        }),
      }),
    ]);
  });

  it('repairs a free user when an existing subscription becomes active', async () => {
    await addUser(db, 'user1', 'free', {
      stripe_customer_id: 'cus_test',
      stripe_subscription_id: 'sub_test',
    });
    const user = db.users.get('user1')!;
    const body = JSON.stringify({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test',
          status: 'active',
          customer: 'cus_test',
          metadata: {},
        },
      },
    });
    const signature = await createStripeSignature(body, env.STRIPE_WEBHOOK_SECRET!);

    const response = await request(env, '/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': signature },
      body,
    });

    expect(response.status).toBe(200);
    expect(user.tier).toBe('pro');
    expect(user.stripe_customer_id).toBe('cus_test');
    expect(user.stripe_subscription_id).toBe('sub_test');
    expect(db.events).toHaveLength(1);
  });

  it('downgrades recoverable inactive subscriptions without unlinking them', async () => {
    await addUser(db, 'user1', 'pro', {
      stripe_customer_id: 'cus_test',
      stripe_subscription_id: 'sub_test',
    });
    const user = db.users.get('user1')!;
    const body = JSON.stringify({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test',
          status: 'unpaid',
          customer: 'cus_test',
          metadata: {},
        },
      },
    });
    const signature = await createStripeSignature(body, env.STRIPE_WEBHOOK_SECRET!);

    const response = await request(env, '/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': signature },
      body,
    });

    expect(response.status).toBe(200);
    expect(user.tier).toBe('free');
    expect(user.stripe_customer_id).toBe('cus_test');
    expect(user.stripe_subscription_id).toBe('sub_test');
  });

  it('downgrades deleted subscriptions and clears the subscription link', async () => {
    await addUser(db, 'user1', 'pro', {
      stripe_customer_id: 'cus_test',
      stripe_subscription_id: 'sub_test',
    });
    const user = db.users.get('user1')!;
    const body = JSON.stringify({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test',
          status: 'canceled',
          customer: 'cus_test',
          metadata: {},
        },
      },
    });
    const signature = await createStripeSignature(body, env.STRIPE_WEBHOOK_SECRET!);

    const response = await request(env, '/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': signature },
      body,
    });

    expect(response.status).toBe(200);
    expect(user.tier).toBe('free');
    expect(user.stripe_customer_id).toBe('cus_test');
    expect(user.stripe_subscription_id).toBeNull();
  });

  it('ignores stale inactive events for old subscriptions', async () => {
    await addUser(db, 'user1', 'pro', {
      stripe_customer_id: 'cus_new',
      stripe_subscription_id: 'sub_new',
    });
    const user = db.users.get('user1')!;
    const body = JSON.stringify({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_old',
          status: 'canceled',
          customer: 'cus_old',
          metadata: { vanish_user_id: 'user1' },
        },
      },
    });
    const signature = await createStripeSignature(body, env.STRIPE_WEBHOOK_SECRET!);

    const response = await request(env, '/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': signature },
      body,
    });

    expect(response.status).toBe(200);
    expect(user.tier).toBe('pro');
    expect(user.stripe_customer_id).toBe('cus_new');
    expect(user.stripe_subscription_id).toBe('sub_new');
  });
});

function request(env: Env, path: string, init?: RequestInit) {
  return worker.fetch(new Request(`https://vanish.sh${path}`, init), env, {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext);
}

async function addUser(
  db: BillingDB,
  id: string,
  tier: Tier,
  overrides: Partial<User> = {}
): Promise<string> {
  const apiKey = `vnsh_${id}`;
  const keyHash = await hashApiKey(apiKey);
  const user: User = {
    id,
    github_id: null,
    email: `${id}@example.com`,
    github_username: id,
    tier,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  db.users.set(id, user);
  db.apiKeys.set(keyHash, user);
  return apiKey;
}

async function createStripeSignature(body: string, secret: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`)
  );
  const hex = Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  return `t=${timestamp},v1=${hex}`;
}

class BillingDB {
  users = new Map<string, User>();
  apiKeys = new Map<string, User>();
  events: Array<{ id: string; name: string; user_id: string | null; site_id: string | null; upload_id: string | null; properties: string }> = [];

  prepare(sql: string): BillingStatement {
    return new BillingStatement(this, sql);
  }
}

class BillingStatement {
  private args: unknown[] = [];

  constructor(private db: BillingDB, private sql: string) {}

  bind(...args: unknown[]): BillingStatement {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const sql = normalizeSql(this.sql);

    if (sql.includes('FROM api_keys ak JOIN users u')) {
      const [keyHash] = this.args as [string];
      return (this.db.apiKeys.get(keyHash) || null) as T | null;
    }

    if (sql.includes('FROM users WHERE id = ?')) {
      const [userId] = this.args as [string];
      return (this.db.users.get(userId) || null) as T | null;
    }

    if (sql.includes('FROM users WHERE stripe_subscription_id = ?')) {
      const [subscriptionId] = this.args as [string];
      const user = Array.from(this.db.users.values())
        .find(candidate => candidate.stripe_subscription_id === subscriptionId);
      return (user || null) as T | null;
    }

    return null;
  }

  async run(): Promise<void> {
    const sql = normalizeSql(this.sql);

    if (sql.includes('UPDATE api_keys SET last_used_at')) {
      return;
    }

    if (sql.includes('UPDATE users SET stripe_customer_id = ?')) {
      const [customerId, subscriptionId, tier, userId] = this.args as [string, string, Tier, string];
      const user = this.db.users.get(userId);
      if (user) {
        user.stripe_customer_id = customerId;
        user.stripe_subscription_id = subscriptionId;
        user.tier = tier;
        user.updated_at = new Date().toISOString();
      }
      return;
    }

    if (sql.includes("UPDATE users SET tier = 'free', stripe_subscription_id = NULL")) {
      const [userId] = this.args as [string];
      const user = this.db.users.get(userId);
      if (user) {
        user.tier = 'free';
        user.stripe_subscription_id = null;
        user.updated_at = new Date().toISOString();
      }
      return;
    }

    if (sql.includes("UPDATE users SET tier = 'free'")) {
      const [userId] = this.args as [string];
      const user = this.db.users.get(userId);
      if (user) {
        user.tier = 'free';
        user.updated_at = new Date().toISOString();
      }
      return;
    }

    if (sql.includes('INSERT INTO events')) {
      const [id, name, userId, siteId, uploadId, properties] = this.args as [
        string,
        string,
        string | null,
        string | null,
        string | null,
        string,
      ];
      this.db.events.push({
        id,
        name,
        user_id: userId,
        site_id: siteId,
        upload_id: uploadId,
        properties,
      });
      return;
    }

    throw new Error(`Unhandled run query: ${sql}`);
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}
