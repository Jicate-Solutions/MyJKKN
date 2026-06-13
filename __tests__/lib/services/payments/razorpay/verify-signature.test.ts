import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { verifySignature } from '@/lib/services/payments/razorpay/verify-signature';

const SECRET = 'test_secret_value';
function sign(orderId: string, paymentId: string): string {
  return crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');
}

describe('verifySignature', () => {
  it('returns true for valid signature', () => {
    const orderId = 'order_ABC';
    const paymentId = 'pay_XYZ';
    const sig = sign(orderId, paymentId);
    expect(verifySignature({ gatewayOrderId: orderId, gatewayPaymentId: paymentId, signature: sig }, SECRET)).toBe(true);
  });

  it('returns false for tampered signature', () => {
    const sig = sign('order_ABC', 'pay_XYZ');
    const tampered = sig.slice(0, -1) + '0';
    expect(verifySignature({ gatewayOrderId: 'order_ABC', gatewayPaymentId: 'pay_XYZ', signature: tampered }, SECRET)).toBe(false);
  });

  it('returns false for tampered order id', () => {
    const sig = sign('order_ABC', 'pay_XYZ');
    expect(verifySignature({ gatewayOrderId: 'order_DEF', gatewayPaymentId: 'pay_XYZ', signature: sig }, SECRET)).toBe(false);
  });

  it('returns false for empty signature', () => {
    expect(verifySignature({ gatewayOrderId: 'order_ABC', gatewayPaymentId: 'pay_XYZ', signature: '' }, SECRET)).toBe(false);
  });

  it('returns false when the key secret is empty', () => {
    const sig = sign('order_ABC', 'pay_XYZ');
    expect(verifySignature({ gatewayOrderId: 'order_ABC', gatewayPaymentId: 'pay_XYZ', signature: sig }, '')).toBe(false);
  });
});
