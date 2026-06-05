import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { verifyWebhookSignature } from '@/lib/services/payments/razorpay/verify-webhook';

const SECRET = 'webhook_secret_value';
function sign(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('verifyWebhookSignature', () => {
  it('returns true for matching signature', () => {
    const body = '{"event":"payment.captured"}';
    const sig = sign(body);
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: sig }, SECRET)).toBe(true);
  });

  it('returns false for tampered body', () => {
    const sig = sign('{"event":"payment.captured"}');
    expect(verifyWebhookSignature({ rawBody: '{"event":"payment.failed"}', signatureHeader: sig }, SECRET)).toBe(false);
  });

  it('returns false for missing signature header', () => {
    expect(verifyWebhookSignature({ rawBody: '{}', signatureHeader: '' }, SECRET)).toBe(false);
  });

  it('returns false when the webhook secret is empty', () => {
    const body = '{"event":"payment.captured"}';
    const sig = sign(body);
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: sig }, '')).toBe(false);
  });
});
