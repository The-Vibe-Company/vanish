const STRIPE_API = 'https://api.stripe.com/v1';

const secretKey = process.env.STRIPE_SECRET_KEY;
const legacyPriceId = process.env.STRIPE_PRICE_ID;
const proPriceId = process.env.STRIPE_PRO_PRICE_ID_EUR_10;

if (!secretKey || !legacyPriceId || !proPriceId) {
  throw new Error(
    'STRIPE_SECRET_KEY, STRIPE_PRICE_ID, and STRIPE_PRO_PRICE_ID_EUR_10 are required'
  );
}

if (legacyPriceId === proPriceId) {
  throw new Error('The legacy and replacement Stripe price IDs must differ');
}

const legacyPrice = await stripeRequest(`/prices/${encodeURIComponent(legacyPriceId)}`);
if (!legacyPrice.active) {
  process.stdout.write('already retired');
} else {
  await stripeRequest(`/prices/${encodeURIComponent(legacyPriceId)}`, {
    method: 'POST',
    body: new URLSearchParams({ active: 'false' }),
  });
  process.stdout.write('retired');
}

// Do not expire Checkout sessions created before the cutover. Stripe keeps them
// short-lived, and letting those already-issued offers complete avoids revoking
// a payment while it is in progress. They are intentionally grandfathered,
// like existing €2 subscribers; all new sessions use the replacement price.

async function stripeRequest(path, init = {}) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || `Stripe request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}
