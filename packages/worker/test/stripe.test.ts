import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature } from '../src/lib/stripe.js';

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_test_secret_key';

  async function createSignature(payload: string, secret: string, timestamp?: number): Promise<string> {
    const ts = timestamp || Math.floor(Date.now() / 1000);
    const signedPayload = `${ts}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(signedPayload)
    );
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return `t=${ts},v1=${signature}`;
  }

  it('accepts a valid signature', async () => {
    const payload = '{"type":"checkout.session.completed"}';
    const sigHeader = await createSignature(payload, secret);
    const result = await verifyWebhookSignature(payload, sigHeader, secret);
    expect(result).toBe(true);
  });

  it('rejects an invalid signature', async () => {
    const payload = '{"type":"checkout.session.completed"}';
    const sigHeader = 't=1234567890,v1=invalidsignature';
    const result = await verifyWebhookSignature(payload, sigHeader, secret);
    expect(result).toBe(false);
  });

  it('rejects a tampered payload', async () => {
    const payload = '{"type":"checkout.session.completed"}';
    const sigHeader = await createSignature(payload, secret);
    const tamperedPayload = '{"type":"customer.subscription.deleted"}';
    const result = await verifyWebhookSignature(tamperedPayload, sigHeader, secret);
    expect(result).toBe(false);
  });

  it('rejects a wrong secret', async () => {
    const payload = '{"type":"test"}';
    const sigHeader = await createSignature(payload, 'wrong_secret');
    const result = await verifyWebhookSignature(payload, sigHeader, secret);
    expect(result).toBe(false);
  });

  it('rejects an expired timestamp', async () => {
    const payload = '{"type":"test"}';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const sigHeader = await createSignature(payload, secret, oldTimestamp);
    const result = await verifyWebhookSignature(payload, sigHeader, secret, 300);
    expect(result).toBe(false);
  });

  it('rejects missing signature parts', async () => {
    const result1 = await verifyWebhookSignature('{}', 'invalid_header', secret);
    expect(result1).toBe(false);

    const result2 = await verifyWebhookSignature('{}', 't=123', secret);
    expect(result2).toBe(false);

    const result3 = await verifyWebhookSignature('{}', 'v1=abc', secret);
    expect(result3).toBe(false);
  });
});
