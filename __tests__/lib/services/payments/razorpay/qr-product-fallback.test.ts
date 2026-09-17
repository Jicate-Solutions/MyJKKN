/**
 * Tests for the QR → hosted-checkout fallback predicate.
 *
 * WHY THIS ONE FUNCTION IS WORTH TESTING ON ITS OWN. It decides whether a failed
 * `POST /payments/qr_codes` is SWALLOWED (open an order instead, cashier sees
 * nothing) or SURFACED. Both mistakes are expensive and neither is loud:
 *
 *   - too broad → a real bug in our request (a bad amount, a malformed close_by, a
 *     note over the limit) silently degrades every counter to the redirect flow, and
 *     the QR feature simply never works with nothing in the logs saying why;
 *
 *   - too narrow → an account without the QR product shows the cashier an error at
 *     the till instead of quietly collecting the money through an order.
 *
 * The 400 boundary is the whole game: a 400 that says "feature not enabled" is a
 * capability answer, and a 400 that says "amount must be at least 100" is our bug.
 */
import { describe, it, expect } from 'vitest';

import { RazorpayApiError } from '@/lib/services/payments/razorpay/client';
import { isQrProductUnavailable } from '@/lib/services/payments/razorpay/qr-code';

const err = (status: number, message: string) =>
  new RazorpayApiError(status, 'BAD_REQUEST_ERROR', message, null);

describe('isQrProductUnavailable', () => {
  it('treats a 404 as an unprovisioned product', () => {
    // The exact shape recorded against the 2026-07-30 attempt: the route itself is
    // absent on an account without the QR product.
    expect(isQrProductUnavailable(err(404, 'The requested URL was not found on the server.')))
      .toBe(true);
  });

  it('treats a 400 that names the feature as unprovisioned', () => {
    for (const m of [
      'QR code is not enabled for this merchant',
      'This feature is not activated on your account',
      'qr_codes is not supported',
      'The requested feature is not available',
      'You are not subscribed to this product',
    ]) {
      expect(isQrProductUnavailable(err(400, m)), m).toBe(true);
    }
  });

  it('does NOT swallow a 400 caused by our own request', () => {
    // Each of these is a bug in createQrCode's params. Falling back on them would
    // hide the defect behind a working-but-wrong redirect forever.
    for (const m of [
      'The amount must be atleast INR 1.00',
      'close_by should be at least 15 minutes from now',
      'notes may contain a maximum of 15 key-value pairs',
      'The name field is required',
    ]) {
      expect(isQrProductUnavailable(err(400, m)), m).toBe(false);
    }
  });

  it('does NOT swallow auth, rate-limit or server failures', () => {
    expect(isQrProductUnavailable(err(401, 'Authentication failed'))).toBe(false);
    expect(isQrProductUnavailable(err(429, 'Too many requests'))).toBe(false);
    expect(isQrProductUnavailable(err(500, 'Server error'))).toBe(false);
    expect(isQrProductUnavailable(err(502, 'Bad gateway'))).toBe(false);
  });

  it('does NOT swallow a non-Razorpay error', () => {
    // A network drop or a bug in our own code must reach the cashier, not quietly
    // reroute the money through a different instrument.
    expect(isQrProductUnavailable(new Error('fetch failed'))).toBe(false);
    expect(isQrProductUnavailable(new TypeError('undefined is not a function'))).toBe(false);
    expect(isQrProductUnavailable(null)).toBe(false);
    expect(isQrProductUnavailable(undefined)).toBe(false);
  });
});
