import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Stripe Pro price deployment helper', () => {
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('archives the legacy price and expires its open Checkout sessions before outputting the new price', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_PRICE_ID = 'price_legacy';
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(`${init?.method || 'GET'} ${url.pathname}`);

      if (url.pathname === '/v1/prices/price_legacy' && !init?.method) {
        return Response.json({ id: 'price_legacy', product: 'prod_vanish', active: true });
      }
      if (url.pathname === '/v1/prices' && !init?.method) {
        return Response.json({
          data: [{
            id: 'price_pro',
            product: 'prod_vanish',
            active: true,
            unit_amount: 1000,
            currency: 'eur',
            recurring: { interval: 'month' },
          }],
        });
      }
      if (url.pathname === '/v1/prices/price_legacy' && init?.method === 'POST') {
        return Response.json({ id: 'price_legacy', active: false });
      }
      if (url.pathname === '/v1/checkout/sessions') {
        return Response.json({ data: [{ id: 'cs_legacy' }], has_more: false });
      }
      if (url.pathname === '/v1/checkout/sessions/cs_legacy/line_items') {
        return Response.json({ data: [{ price: { id: 'price_legacy' } }] });
      }
      if (url.pathname === '/v1/checkout/sessions/cs_legacy/expire') {
        return Response.json({ id: 'cs_legacy', status: 'expired' });
      }
      return Response.json({ error: { message: `Unhandled ${url.pathname}` } }, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await import('../../../scripts/ensure-stripe-pro-price.mjs?retire-legacy');

    expect(calls).toEqual([
      'GET /v1/prices/price_legacy',
      'GET /v1/prices',
      'POST /v1/prices/price_legacy',
      'GET /v1/checkout/sessions',
      'GET /v1/checkout/sessions/cs_legacy/line_items',
      'POST /v1/checkout/sessions/cs_legacy/expire',
    ]);
    expect(stdoutSpy).toHaveBeenCalledWith('price_pro');
  });
});
