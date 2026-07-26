import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, PaidTier, Tier } from '../types.js';
import { TIER_LIMITS } from '../types.js';
import { StripeClient, verifyWebhookSignature } from '../lib/stripe.js';
import { logProductEvent } from '../lib/events.js';
import { beginDomainGrace, resumeDomainsAfterUpgrade } from '../lib/custom-domains.js';

const billing = new Hono<{ Bindings: Env }>();

const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];
const INACTIVE_SUBSCRIPTION_STATUSES = ['past_due', 'unpaid', 'canceled', 'incomplete_expired'];

type BillingUserRecord = {
  id: string;
  tier: Tier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

type StripeSubscriptionPayload = {
  id?: unknown;
  status?: unknown;
  customer?: unknown;
  metadata?: unknown;
};

type BillingContext = Context<{ Bindings: Env }>;

/**
 * GET/POST /billing/checkout - Create a Stripe Checkout session.
 * GET redirects for the CLI; POST returns JSON for the dashboard.
 * Requires authentication.
 */
billing.on(['GET', 'POST'], '/billing/checkout', async (c) => {
  if (c.env.SELF_HOSTED === 'true') {
    return c.json({ error: 'Billing is not available on self-hosted instances' }, 404);
  }

  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required. Run: vanish login' }, 401);
  }

  const requestedTier = readCheckoutTier(c.req.query('tier'));
  if (!requestedTier) {
    return c.json({ error: 'Unknown plan. Choose pro.' }, 400);
  }

  if (user.tier === requestedTier) {
    return c.json({ error: `Already on ${planName(requestedTier)} tier`, tier: requestedTier }, 400);
  }
  if (user.stripe_subscription_id) {
    return c.json({
      error: 'Use Manage billing to change an existing subscription.',
      tier: user.tier,
      manageBilling: true,
    }, 409);
  }

  const priceId = c.env.STRIPE_PRO_PRICE_ID_EUR_10;
  if (!c.env.STRIPE_SECRET_KEY || !priceId) {
    return c.json({ error: 'Stripe not configured' }, 503);
  }

  const stripe = new StripeClient(c.env.STRIPE_SECRET_KEY);
  const baseUrl = c.env.BASE_URL;

  const session = await stripe.createCheckoutSession({
    priceId,
    customerId: user.stripe_customer_id || undefined,
    customerEmail: !user.stripe_customer_id ? (user.email || undefined) : undefined,
    metadata: { vanish_user_id: user.id, vanish_tier: requestedTier },
    successUrl: `${baseUrl}/billing/success?tier=${requestedTier}`,
    cancelUrl: `${baseUrl}/billing/cancel`,
  });

  await logProductEvent(c.env, {
    name: 'upgrade_clicked',
    userId: user.id,
    properties: {
      tier: user.tier,
      target_tier: requestedTier,
      checkout_provider: 'stripe',
    },
  });

  return c.req.method === 'POST' ? c.json({ url: session.url }) : c.redirect(session.url);
});

async function createBillingPortalUrl(c: BillingContext): Promise<
  { ok: true; url: string } | { ok: false; response: Response }
> {
  if (c.env.SELF_HOSTED === 'true') {
    return { ok: false, response: c.json({ error: 'Billing is not available on self-hosted instances' }, 404) };
  }

  const user = c.get('user');
  if (!user) {
    return { ok: false, response: c.json({ error: 'Authentication required' }, 401) };
  }

  if (!user.stripe_customer_id) {
    return { ok: false, response: c.json({ error: 'No billing account found. Upgrade first: vanish upgrade' }, 400) };
  }

  if (!c.env.STRIPE_SECRET_KEY) {
    return { ok: false, response: c.json({ error: 'Stripe not configured' }, 503) };
  }

  const stripe = new StripeClient(c.env.STRIPE_SECRET_KEY);

  const session = await stripe.createPortalSession({
    customerId: user.stripe_customer_id,
    returnUrl: c.env.BASE_URL + '/dashboard#billing',
  });

  return { ok: true, url: session.url };
}

/**
 * GET /billing/portal - Redirect to Stripe Customer Portal.
 * Requires authentication + existing Stripe customer.
 */
billing.get('/billing/portal', async (c) => {
  const result = await createBillingPortalUrl(c);
  if (!result.ok) {
    return result.response;
  }

  return c.redirect(result.url);
});

/**
 * POST /billing/portal - Create a Stripe Customer Portal session.
 * Used by the dashboard so API keys stay in Authorization headers, not URLs.
 */
billing.post('/billing/portal', async (c) => {
  const result = await createBillingPortalUrl(c);
  if (!result.ok) {
    return result.response;
  }

  return c.json({ url: result.url });
});

/**
 * GET /billing/success - Shown after successful checkout.
 */
billing.get('/billing/success', (c) => {
  const tier = readCheckoutTier(c.req.query('tier')) || 'pro';
  const limits = TIER_LIMITS[tier];
  const storageGb = Math.round(limits.maxTotalStorage / (1024 * 1024 * 1024));
  return c.html(`<!DOCTYPE html>
<html><head><title>vanish - Upgrade successful</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; text-align: center; }
</style></head>
<body>
  <h1>Welcome to ${planName(tier)}!</h1>
  <p>Your account has been upgraded. You now have:</p>
  <ul style="text-align:left;display:inline-block;">
    <li>${storageGb} GB total storage</li>
    <li>Up to ${limits.maxCustomExpiryDays} days retention</li>
    <li>${limits.rateLimit} requests/hour</li>
  </ul>
  <p>You can close this tab and continue using <code>vanish</code>.</p>
</body></html>`);
});

/**
 * GET /billing/cancel - Shown when checkout is cancelled.
 */
billing.get('/billing/cancel', (c) => {
  return c.html(`<!DOCTYPE html>
<html><head><title>vanish - Checkout cancelled</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; text-align: center; }
</style></head>
<body>
  <h1>Checkout cancelled</h1>
  <p>No worries! You can upgrade anytime by running <code>vanish upgrade</code>.</p>
</body></html>`);
});

/**
 * GET /billing/portal-return - Return page after leaving Stripe portal.
 */
billing.get('/billing/portal-return', (c) => {
  return c.html(`<!DOCTYPE html>
<html><head><title>vanish - Billing</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; text-align: center; }
</style></head>
<body>
  <h1>Billing updated</h1>
  <p>Your billing changes have been saved.</p>
  <p><a href="/dashboard#billing">Back to dashboard</a></p>
</body></html>`);
});

/**
 * POST /webhooks/stripe - Handle Stripe webhook events.
 * Events handled:
 *   - checkout.session.completed: link Stripe customer to user, activate the selected paid tier
 *   - customer.subscription.created: reconcile active subscription state
 *   - customer.subscription.deleted: downgrade to Free
 *   - customer.subscription.updated: handle status changes
 */
billing.post('/webhooks/stripe', async (c) => {
  if (!c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: 'Webhook secret not configured' }, 503);
  }

  const sigHeader = c.req.header('Stripe-Signature');
  if (!sigHeader) {
    return c.json({ error: 'Missing Stripe-Signature header' }, 400);
  }

  const body = await c.req.text();

  const isValid = await verifyWebhookSignature(
    body,
    sigHeader,
    c.env.STRIPE_WEBHOOK_SECRET
  );

  if (!isValid) {
    return c.json({ error: 'Invalid signature' }, 400);
  }

  const event = JSON.parse(body) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = (session.metadata as Record<string, string>)?.vanish_user_id;
      const paidTier = readMetadataTier(session.metadata) || 'pro';
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      if (!userId) {
        console.error('Webhook: checkout.session.completed without vanish_user_id');
        break;
      }

      const currentUser = await c.env.DB.prepare(`
        SELECT id, tier, stripe_customer_id, stripe_subscription_id
        FROM users
        WHERE id = ?
      `).bind(userId).first<BillingUserRecord>();

      if (!currentUser) {
        console.error(`Webhook: checkout.session.completed for unknown user ${userId}`);
        break;
      }

      await setUserPaidTier(c.env, currentUser, customerId, subscriptionId, 'active', paidTier);
      console.log(`User ${redactIdentifier(userId)} upgraded to ${paidTier}`);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as StripeSubscriptionPayload;
      await reconcileSubscription(c.env, subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as StripeSubscriptionPayload;
      await downgradeSubscription(c.env, subscription, 'canceled', true);
      break;
    }

    default:
      // Ignore unhandled events
      break;
  }

  return c.json({ received: true });
});

export default billing;

async function reconcileSubscription(env: Env, subscription: StripeSubscriptionPayload): Promise<void> {
  const subscriptionId = typeof subscription.id === 'string' ? subscription.id : '';
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : '';
  const status = typeof subscription.status === 'string' ? subscription.status : '';

  if (!subscriptionId || !status) {
    console.error('Webhook: subscription event missing id or status');
    return;
  }

  if (ACTIVE_SUBSCRIPTION_STATUSES.includes(status)) {
    if (!customerId) {
      console.error(`Webhook: active subscription ${subscriptionId} missing customer`);
      return;
    }

    const user = await findUserForSubscription(env, subscription);
    if (!user) {
      console.error(`Webhook: active subscription ${subscriptionId} could not be linked to a user`);
      return;
    }

    const paidTier = readMetadataTier(subscription.metadata) || 'pro';
    await setUserPaidTier(env, user, customerId, subscriptionId, status, paidTier);
    console.log(`Subscription ${redactIdentifier(subscriptionId)} status ${status} - user ${redactIdentifier(user.id)} set to ${paidTier}`);
    return;
  }

  if (INACTIVE_SUBSCRIPTION_STATUSES.includes(status)) {
    await downgradeSubscription(env, subscription, status, false);
  }
}

async function findUserForSubscription(
  env: Env,
  subscription: StripeSubscriptionPayload
): Promise<BillingUserRecord | null> {
  const subscriptionId = typeof subscription.id === 'string' ? subscription.id : '';
  const metadataUserId = readMetadataUserId(subscription.metadata);

  if (subscriptionId) {
    const bySubscription = await env.DB.prepare(`
      SELECT id, tier, stripe_customer_id, stripe_subscription_id
      FROM users
      WHERE stripe_subscription_id = ?
    `).bind(subscriptionId).first<BillingUserRecord>();

    if (bySubscription) {
      return bySubscription;
    }
  }

  if (!metadataUserId) {
    return null;
  }

  return env.DB.prepare(`
    SELECT id, tier, stripe_customer_id, stripe_subscription_id
    FROM users
    WHERE id = ?
  `).bind(metadataUserId).first<BillingUserRecord>();
}

async function setUserPaidTier(
  env: Env,
  user: BillingUserRecord,
  customerId: string,
  subscriptionId: string,
  subscriptionStatus: string,
  paidTier: PaidTier,
): Promise<void> {
  const currentUser = await env.DB.prepare(`
    SELECT id, tier, stripe_customer_id, stripe_subscription_id
    FROM users
    WHERE id = ?
  `).bind(user.id).first<BillingUserRecord>();
  const alreadyRecorded = currentUser?.tier === paidTier &&
    currentUser.stripe_customer_id === customerId &&
    currentUser.stripe_subscription_id === subscriptionId;

  await env.DB.prepare(`
    UPDATE users
    SET stripe_customer_id = ?, stripe_subscription_id = ?, tier = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(customerId, subscriptionId, paidTier, user.id).run();
  await resumeDomainsAfterUpgrade(env, user.id);

  if (alreadyRecorded) {
    return;
  }

  await logProductEvent(env, {
    name: 'upgrade_completed',
    userId: user.id,
    properties: {
      tier: paidTier,
      checkout_provider: 'stripe',
      subscription_status: subscriptionStatus,
    },
  });
}

async function downgradeSubscription(
  env: Env,
  subscription: StripeSubscriptionPayload,
  status: string,
  clearSubscriptionLink: boolean
): Promise<void> {
  const subscriptionId = typeof subscription.id === 'string' ? subscription.id : '';

  if (!subscriptionId) {
    console.error('Webhook: inactive subscription event missing id');
    return;
  }

  const user = await env.DB.prepare(`
    SELECT id, tier, stripe_customer_id, stripe_subscription_id
    FROM users
    WHERE stripe_subscription_id = ?
  `).bind(subscriptionId).first<BillingUserRecord>();

  if (!user) {
    console.error(`Webhook: inactive subscription ${redactIdentifier(subscriptionId)} did not match the current user subscription`);
    return;
  }

  if (clearSubscriptionLink) {
    await env.DB.prepare(`
      UPDATE users
      SET tier = 'free', stripe_subscription_id = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).bind(user.id).run();
  } else {
    await env.DB.prepare(`
      UPDATE users
      SET tier = 'free', updated_at = datetime('now')
      WHERE id = ?
    `).bind(user.id).run();
  }
  await beginDomainGrace(env, user.id);

  console.log(`Subscription ${redactIdentifier(subscriptionId)} status ${status} - user ${redactIdentifier(user.id)} downgraded to free`);
}

function readMetadataUserId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const value = (metadata as Record<string, unknown>).vanish_user_id;
  return typeof value === 'string' && value ? value : null;
}

function readCheckoutTier(value: string | undefined): PaidTier | null {
  if (!value) {
    return 'pro';
  }
  return value === 'pro' ? value : null;
}

function readMetadataTier(metadata: unknown): PaidTier | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const value = (metadata as Record<string, unknown>).vanish_tier;
  return value === 'pro' ? value : null;
}

function planName(_tier: PaidTier): string {
  return 'Pro';
}

function redactIdentifier(value: string): string {
  if (value.length <= 8) {
    return '<redacted>';
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
