const STRIPE_API = 'https://api.stripe.com/v1';
const LOOKUP_KEY = 'vanish_pro_monthly_eur_10';
const EXPECTED_AMOUNT = 1000;

const secretKey = process.env.STRIPE_SECRET_KEY;
const seedPriceId = process.env.STRIPE_PRICE_ID;

if (!secretKey || !seedPriceId) {
  throw new Error('STRIPE_SECRET_KEY and STRIPE_PRICE_ID are required');
}

const seedPrice = await stripeRequest(`/prices/${encodeURIComponent(seedPriceId)}`);
if (!seedPrice.product) {
  throw new Error(`Stripe price ${seedPriceId} has no product`);
}

const existing = await stripeRequest(`/prices?${new URLSearchParams({
  active: 'true',
  'lookup_keys[]': LOOKUP_KEY,
  limit: '10',
})}`);

let proPrice = existing.data?.find(price =>
  price.product === seedPrice.product &&
  price.unit_amount === EXPECTED_AMOUNT &&
  price.currency === 'eur' &&
  price.recurring?.interval === 'month'
);

if (!proPrice) {
  const body = new URLSearchParams({
    product: seedPrice.product,
    currency: 'eur',
    unit_amount: String(EXPECTED_AMOUNT),
    'recurring[interval]': 'month',
    lookup_key: LOOKUP_KEY,
    'metadata[vanish_plan]': 'pro',
    'metadata[storage_gb]': '10',
  });
  proPrice = await stripeRequest('/prices', {
    method: 'POST',
    body,
  });
}

assertProPrice(proPrice);
process.stdout.write(proPrice.id);

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

function assertProPrice(price) {
  if (
    typeof price?.id !== 'string' ||
    price.unit_amount !== EXPECTED_AMOUNT ||
    price.currency !== 'eur' ||
    price.recurring?.interval !== 'month'
  ) {
    throw new Error('Resolved Stripe price is not a recurring 10 EUR monthly price');
  }
}
