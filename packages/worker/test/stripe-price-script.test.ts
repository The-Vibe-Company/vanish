import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Stripe Pro price deployment helper', () => {
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
    delete process.env.STRIPE_PRO_PRICE_ID_EUR_10;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('archives the legacy price only after the replacement price is available', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_PRICE_ID = 'price_legacy';
    process.env.STRIPE_PRO_PRICE_ID_EUR_10 = 'price_pro';
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(`${init?.method || 'GET'} ${url.pathname}`);

      if (url.pathname === '/v1/prices/price_legacy' && !init?.method) {
        return Response.json({ id: 'price_legacy', product: 'prod_vanish', active: true });
      }
      if (url.pathname === '/v1/prices/price_legacy' && init?.method === 'POST') {
        return Response.json({ id: 'price_legacy', active: false });
      }
      return Response.json({ error: { message: `Unhandled ${url.pathname}` } }, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await import('../../../scripts/retire-stripe-legacy-price.mjs?retire-legacy');

    expect(calls).toEqual([
      'GET /v1/prices/price_legacy',
      'POST /v1/prices/price_legacy',
    ]);
    expect(stdoutSpy).toHaveBeenCalledWith('retired');
  });
});
