import * as crypto from 'node:crypto';
import type { VerifySignatureInput } from '../provider';

export function verifySignature(input: VerifySignatureInput): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  if (!input.signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${input.gatewayOrderId}|${input.gatewayPaymentId}`)
    .digest('hex');
  // timingSafeEqual throws on mismatched buffer lengths — pre-check.
  if (expected.length !== input.signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
  } catch {
    return false;
  }
}
