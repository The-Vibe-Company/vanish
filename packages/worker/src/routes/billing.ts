import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types.js';
import { StripeClient, verifyWebhookSignature } from '../lib/stripe.js';
import { logProductEvent } from '../lib/events.js';

const billing = new Hono<{ Bindings: Env }>();

const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];
const INACTIVE_SUBSCRIPTION_STATUSES = ['past_due', 'unpaid', 'canceled', 'incomplete_expired'];

type BillingUserRecord = {
  id: string;
  tier: string;
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
 * GET /billing/checkout - Create a Stripe Checkout session and redirect.
 * Requires authentication.
 */
billing.get('/billing/checkout', async (c) => {
  if (c.env.SELF_HOSTED === 'true') {
    return c.json({ error: 'Billing is not available on self-hosted instances' }, 404);
  }

  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required. Run: vanish login' }, 401);
  }

  if (user.tier === 'pro') {
    return c.json({ error: 'Already on Pro tier', tier: 'pro' }, 400);
  }

  if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_PRICE_ID) {
    return c.json({ error: 'Stripe not configured' }, 503);
  }

  const stripe = new StripeClient(c.env.STRIPE_SECRET_KEY);
  const baseUrl = c.env.BASE_URL;

  const session = await stripe.createCheckoutSession({
    priceId: c.env.STRIPE_PRICE_ID,
    customerId: user.stripe_customer_id || undefined,
    customerEmail: !user.stripe_customer_id ? (user.email || undefined) : undefined,
    metadata: { vanish_user_id: user.id },
    successUrl: `${baseUrl}/billing/success`,
    cancelUrl: `${baseUrl}/billing/cancel`,
  });

  await logProductEvent(c.env, {
    name: 'upgrade_clicked',
    userId: user.id,
    properties: {
      tier: user.tier,
      checkout_provider: 'stripe',
    },
  });

  return c.redirect(session.url);
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
  return c.html(`<!DOCTYPE html>
<html><head><title>vanish - Upgrade successful</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; text-align: center; }
</style></head>
<body>
  <h1>Welcome to Pro!</h1>
  <p>Your account has been upgraded. You now have:</p>
  <ul style="text-align:left;display:inline-block;">
    <li>1 GB max file size</li>
    <li>Unlimited retention</li>
    <li>200 uploads/hour</li>
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
 *   - checkout.session.completed: link Stripe customer to user, upgrade to Pro
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

      await upgradeUserToPro(c.env, currentUser, customerId, subscriptionId, 'active');
      console.log(`User ${userId} upgraded to Pro (customer: ${customerId})`);
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

    await upgradeUserToPro(env, user, customerId, subscriptionId, status);
    console.log(`Subscription ${redactIdentifier(subscriptionId)} status ${status} - user ${redactIdentifier(user.id)} upgraded to pro`);
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

async function upgradeUserToPro(
  env: Env,
  user: BillingUserRecord,
  customerId: string,
  subscriptionId: string,
  subscriptionStatus: string
): Promise<void> {
  const currentUser = await env.DB.prepare(`
    SELECT id, tier, stripe_customer_id, stripe_subscription_id
    FROM users
    WHERE id = ?
  `).bind(user.id).first<BillingUserRecord>();
  const alreadyRecorded = currentUser?.tier === 'pro' &&
    currentUser.stripe_customer_id === customerId &&
    currentUser.stripe_subscription_id === subscriptionId;

  await env.DB.prepare(`
    UPDATE users
    SET stripe_customer_id = ?, stripe_subscription_id = ?, tier = 'pro', updated_at = datetime('now')
    WHERE id = ?
  `).bind(customerId, subscriptionId, user.id).run();

  if (alreadyRecorded) {
    return;
  }

  await logProductEvent(env, {
    name: 'upgrade_completed',
    userId: user.id,
    properties: {
      tier: 'pro',
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

  console.log(`Subscription ${redactIdentifier(subscriptionId)} status ${status} - user ${redactIdentifier(user.id)} downgraded to free`);
}

function readMetadataUserId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const value = (metadata as Record<string, unknown>).vanish_user_id;
  return typeof value === 'string' && value ? value : null;
}

function redactIdentifier(value: string): string {
  if (value.length <= 8) {
    return '<redacted>';
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
