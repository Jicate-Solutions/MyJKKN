// __tests__/meetings/razorpay-booking-service.test.ts
//
// Unit suite for the Universal-Booking Razorpay deposit wrapper
// (lib/services/integrations/razorpay-booking-service.ts). The HTTP order
// create is delegated to the shared razorpayRequest client (mocked here); we
// test the env gate, the fail-closed contracts, and the REAL HMAC signature
// verification (so a tampered payload is provably rejected).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as crypto from 'node:crypto';

// Mock the shared HTTP client so no network call happens; capture its args.
const razorpayRequestMock = vi.fn();
vi.mock('@/lib/services/payments/razorpay/client', () => ({
  razorpayRequest: (...args: unknown[]) => razorpayRequestMock(...args),
}));

import {
  createBookingOrder,
  isRazorpayBookingConfigured,
  verifyBookingPayment,
} from '@/lib/services/integrations/razorpay-booking-service';

const KEY_ID = 'rzp_test_keyid';
const KEY_SECRET = 'rzp_test_secret';

function setCreds(present: boolean): void {
  if (present) {
    vi.stubEnv('RAZORPAY_KEY_ID', KEY_ID);
    vi.stubEnv('RAZORPAY_KEY_SECRET', KEY_SECRET);
  } else {
    vi.stubEnv('RAZORPAY_KEY_ID', '');
    vi.stubEnv('RAZORPAY_KEY_SECRET', '');
  }
}

beforeEach(() => {
  razorpayRequestMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isRazorpayBookingConfigured', () => {
  it('is false when either credential is missing', () => {
    setCreds(false);
    expect(isRazorpayBookingConfigured()).toBe(false);
    vi.stubEnv('RAZORPAY_KEY_ID', KEY_ID);
    vi.stubEnv('RAZORPAY_KEY_SECRET', '');
    expect(isRazorpayBookingConfigured()).toBe(false);
  });

  it('is true only when both credentials are present', () => {
    setCreds(true);
    expect(isRazorpayBookingConfigured()).toBe(true);
  });
});

describe('createBookingOrder (fail-closed)', () => {
  it('returns null without calling the API when unconfigured', async () => {
    setCreds(false);
    const out = await createBookingOrder({ amountPaise: 50000, receipt: 'booking-x' });
    expect(out).toBeNull();
    expect(razorpayRequestMock).not.toHaveBeenCalled();
  });

  it('rejects a non-positive amount before any API call', async () => {
    setCreds(true);
    expect(await createBookingOrder({ amountPaise: 0, receipt: 'booking-x' })).toBeNull();
    expect(await createBookingOrder({ amountPaise: -100, receipt: 'booking-x' })).toBeNull();
    expect(razorpayRequestMock).not.toHaveBeenCalled();
  });

  it('returns the order handle + public key on success', async () => {
    setCreds(true);
    razorpayRequestMock.mockResolvedValue({
      id: 'order_ABC',
      amount: 50000,
      currency: 'INR',
      receipt: 'booking-x',
      status: 'created',
    });
    const out = await createBookingOrder({ amountPaise: 50000, receipt: 'booking-x' });
    expect(out).toEqual({
      orderId: 'order_ABC',
      amountPaise: 50000,
      currency: 'INR',
      receipt: 'booking-x',
      keyId: KEY_ID,
    });
    // Tags the source so a shared webhook can route booking deposits.
    const params = razorpayRequestMock.mock.calls[0][3] as URLSearchParams;
    expect(params.get('notes[source]')).toBe('universal-booking');
    expect(params.get('amount')).toBe('50000');
  });

  it('returns null (never throws) when the API client throws', async () => {
    setCreds(true);
    razorpayRequestMock.mockRejectedValue(new Error('boom'));
    await expect(
      createBookingOrder({ amountPaise: 50000, receipt: 'booking-x' }),
    ).resolves.toBeNull();
  });
});

describe('verifyBookingPayment (real HMAC)', () => {
  function signature(orderId: string, paymentId: string, secret = KEY_SECRET): string {
    return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  }

  it('returns false when unconfigured', () => {
    setCreds(false);
    expect(
      verifyBookingPayment({ orderId: 'order_A', paymentId: 'pay_A', signature: 'x' }),
    ).toBe(false);
  });

  it('returns false when any field is missing', () => {
    setCreds(true);
    expect(verifyBookingPayment({ orderId: '', paymentId: 'pay_A', signature: 'x' })).toBe(false);
    expect(verifyBookingPayment({ orderId: 'order_A', paymentId: '', signature: 'x' })).toBe(false);
    expect(
      verifyBookingPayment({ orderId: 'order_A', paymentId: 'pay_A', signature: '' }),
    ).toBe(false);
  });

  it('accepts a correctly-signed payload', () => {
    setCreds(true);
    const sig = signature('order_A', 'pay_A');
    expect(verifyBookingPayment({ orderId: 'order_A', paymentId: 'pay_A', signature: sig })).toBe(
      true,
    );
  });

  it('rejects a tampered payment id (signature no longer matches)', () => {
    setCreds(true);
    const sig = signature('order_A', 'pay_A');
    expect(
      verifyBookingPayment({ orderId: 'order_A', paymentId: 'pay_TAMPERED', signature: sig }),
    ).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    setCreds(true);
    const sig = signature('order_A', 'pay_A', 'attacker_secret');
    expect(verifyBookingPayment({ orderId: 'order_A', paymentId: 'pay_A', signature: sig })).toBe(
      false,
    );
  });
});
