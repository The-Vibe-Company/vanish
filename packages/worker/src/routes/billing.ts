import { Hono } from 'hono';
import type { Env } from '../types.js';
import { StripeClient, verifyWebhookSignature } from '../lib/stripe.js';

const billing = new Hono<{ Bindings: Env }>();

/**
 * GET /billing/checkout — Create a Stripe Checkout session and redirect.
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

  return c.redirect(session.url);
});

/**
 * GET /billing/portal — Redirect to Stripe Customer Portal.
 * Requires authentication + existing Stripe customer.
 */
billing.get('/billing/portal', async (c) => {
  if (c.env.SELF_HOSTED === 'true') {
    return c.json({ error: 'Billing is not available on self-hosted instances' }, 404);
  }

  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  if (!user.stripe_customer_id) {
    return c.json({ error: 'No billing account found. Upgrade first: vanish upgrade' }, 400);
  }

  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: 'Stripe not configured' }, 503);
  }

  const stripe = new StripeClient(c.env.STRIPE_SECRET_KEY);

  const session = await stripe.createPortalSession({
    customerId: user.stripe_customer_id,
    returnUrl: c.env.BASE_URL + '/billing/portal-return',
  });

  return c.redirect(session.url);
});

/**
 * GET /billing/success — Shown after successful checkout.
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
 * GET /billing/cancel — Shown when checkout is cancelled.
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
 * GET /billing/portal-return — Return page after leaving Stripe portal.
 */
billing.get('/billing/portal-return', (c) => {
  return c.html(`<!DOCTYPE html>
<html><head><title>vanish - Billing</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; text-align: center; }
</style></head>
<body>
  <h1>Billing updated</h1>
  <p>Your billing changes have been saved. You can close this tab.</p>
</body></html>`);
});

/**
 * POST /webhooks/stripe — Handle Stripe webhook events.
 * Events handled:
 *   - checkout.session.completed: link Stripe customer to user, upgrade to Pro
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

      // Link Stripe customer + subscription to user, upgrade to Pro
      await c.env.DB.prepare(`
        UPDATE users
        SET stripe_customer_id = ?, stripe_subscription_id = ?, tier = 'pro', updated_at = datetime('now')
        WHERE id = ?
      `).bind(customerId, subscriptionId, userId).run();

      console.log(`User ${userId} upgraded to Pro (customer: ${customerId})`);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const subscriptionId = subscription.id as string;

      // Downgrade user to free
      await c.env.DB.prepare(`
        UPDATE users
        SET tier = 'free', stripe_subscription_id = NULL, updated_at = datetime('now')
        WHERE stripe_subscription_id = ?
      `).bind(subscriptionId).run();

      console.log(`Subscription ${subscriptionId} cancelled — user downgraded to free`);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const subscriptionId = subscription.id as string;
      const status = subscription.status as string;

      // If subscription becomes inactive (past_due, unpaid, etc.), downgrade
      if (['past_due', 'unpaid', 'canceled', 'incomplete_expired'].includes(status)) {
        await c.env.DB.prepare(`
          UPDATE users
          SET tier = 'free', updated_at = datetime('now')
          WHERE stripe_subscription_id = ?
        `).bind(subscriptionId).run();

        console.log(`Subscription ${subscriptionId} status ${status} — downgraded to free`);
      } else if (status === 'active') {
        // Re-upgrade if subscription becomes active again
        await c.env.DB.prepare(`
          UPDATE users
          SET tier = 'pro', updated_at = datetime('now')
          WHERE stripe_subscription_id = ?
        `).bind(subscriptionId).run();

        console.log(`Subscription ${subscriptionId} active — upgraded to pro`);
      }
      break;
    }

    default:
      // Ignore unhandled events
      break;
  }

  return c.json({ received: true });
});

export default billing;
