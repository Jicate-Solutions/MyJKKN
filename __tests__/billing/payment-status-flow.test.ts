import { describe, it, expect } from 'vitest';
import {
  classifyPaymentStatus,
  isTerminalPaymentStatus,
  shouldRedirectToFailedPage,
  shouldRedirectToSuccessPage,
  paymentStatusPollInterval,
  buildPaymentRedirectUrl,
  PAYMENT_STATUS_POLL_INTERVAL_MS,
  MAX_PAYMENT_STATUS_POLLS,
} from '@/lib/billing/payment-status-flow';
import type { PaymentStatus } from '@/types/payment-gateway';

// WHAT THESE TESTS PROVE — AND WHAT THEY DO NOT.
// The redirect loop of BUG-006021 / BUG-005380 was a React effect problem: a
// polled object identity re-firing a router.push, plus a router.push sitting in
// a render body. jsdom cannot run on this machine, so the component wiring is
// NOT covered here. What IS covered is the decision layer the two pages now
// share: no status may both trigger a redirect and keep polling, an
// unrecognised status may never be shown as a failure, and the redirect URL
// must not throw away the callback's query params. Those three invariants are
// what made the loop possible.

const ALL_STATUSES: PaymentStatus[] = [
  'initiated',
  'processing',
  'success',
  'failed',
  'cancelled',
  'expired',
  'refunded',
];

describe('classifyPaymentStatus', () => {
  it('classifies every member of the PaymentStatus union', () => {
    expect(ALL_STATUSES.map(classifyPaymentStatus)).toEqual([
      'pending',
      'pending',
      'succeeded',
      'unsuccessful',
      'unsuccessful',
      'unsuccessful',
      'unsuccessful',
    ]);
  });

  it('treats an unmapped, empty or missing status as unknown', () => {
    expect(classifyPaymentStatus('quantum_superposition')).toBe('unknown');
    expect(classifyPaymentStatus('')).toBe('unknown');
    expect(classifyPaymentStatus(null)).toBe('unknown');
    expect(classifyPaymentStatus(undefined)).toBe('unknown');
  });
});

describe('terminal statuses', () => {
  it('includes expired — the 33%-of-production status the old allow-list missed', () => {
    expect(isTerminalPaymentStatus('expired')).toBe(true);
  });

  it('marks every settled status terminal and every in-flight status non-terminal', () => {
    expect(ALL_STATUSES.filter(isTerminalPaymentStatus)).toEqual([
      'success',
      'failed',
      'cancelled',
      'expired',
      'refunded',
    ]);
    expect(isTerminalPaymentStatus('initiated')).toBe(false);
    expect(isTerminalPaymentStatus('processing')).toBe(false);
  });
});

describe('redirect decisions', () => {
  it('never routes a pending or unknown status to the failed page', () => {
    for (const status of ['initiated', 'processing', 'who_knows', '', null, undefined]) {
      expect(shouldRedirectToFailedPage(status)).toBe(false);
    }
  });

  it('routes only genuinely unsuccessful statuses to the failed page', () => {
    expect(ALL_STATUSES.filter(shouldRedirectToFailedPage)).toEqual([
      'failed',
      'cancelled',
      'expired',
      'refunded',
    ]);
  });

  it('routes only success back to the success page', () => {
    expect(ALL_STATUSES.filter(shouldRedirectToSuccessPage)).toEqual(['success']);
    expect(shouldRedirectToSuccessPage('who_knows')).toBe(false);
  });

  it('no status both triggers a redirect and keeps polling — the loop invariant', () => {
    // The bug: `expired` redirected (not in the redirect allow-list) AND polled
    // on (not in the poll-stop allow-list), so the redirect re-fired every 3s.
    for (const status of [...ALL_STATUSES, 'brand_new_gateway_status']) {
      const redirects =
        shouldRedirectToFailedPage(status) || shouldRedirectToSuccessPage(status);
      if (redirects) {
        expect(
          paymentStatusPollInterval({ status, fetchCount: 1 }),
          `status "${status}" redirects but keeps polling`
        ).toBe(false);
      }
    }
  });

  it('the two pages can never both want to redirect for the same status', () => {
    for (const status of [...ALL_STATUSES, 'brand_new_gateway_status']) {
      expect(
        shouldRedirectToFailedPage(status) && shouldRedirectToSuccessPage(status)
      ).toBe(false);
    }
  });
});

describe('paymentStatusPollInterval', () => {
  it('keeps polling an in-flight payment', () => {
    expect(paymentStatusPollInterval({ status: 'initiated', fetchCount: 3 })).toBe(
      PAYMENT_STATUS_POLL_INTERVAL_MS
    );
    expect(paymentStatusPollInterval({ status: 'processing', fetchCount: 3 })).toBe(
      PAYMENT_STATUS_POLL_INTERVAL_MS
    );
  });

  it('stops on every terminal status', () => {
    for (const status of ['success', 'failed', 'cancelled', 'expired', 'refunded']) {
      expect(paymentStatusPollInterval({ status, fetchCount: 0 })).toBe(false);
    }
  });

  it('stops after repeated endpoint errors instead of hammering the route', () => {
    expect(
      paymentStatusPollInterval({ isErrored: true, errorUpdateCount: 1, fetchCount: 1 })
    ).toBe(PAYMENT_STATUS_POLL_INTERVAL_MS);
    expect(
      paymentStatusPollInterval({ isErrored: true, errorUpdateCount: 2, fetchCount: 2 })
    ).toBe(false);
  });

  it('bounds an unrecognised status so it cannot poll forever', () => {
    const status = 'some_future_status';
    expect(paymentStatusPollInterval({ status, fetchCount: 1 })).toBe(
      PAYMENT_STATUS_POLL_INTERVAL_MS
    );
    expect(
      paymentStatusPollInterval({ status, fetchCount: MAX_PAYMENT_STATUS_POLLS - 1 })
    ).toBe(PAYMENT_STATUS_POLL_INTERVAL_MS);
    expect(
      paymentStatusPollInterval({ status, fetchCount: MAX_PAYMENT_STATUS_POLLS })
    ).toBe(false);
  });

  it('bounds a legitimately pending payment too', () => {
    expect(
      paymentStatusPollInterval({ status: 'initiated', fetchCount: MAX_PAYMENT_STATUS_POLLS })
    ).toBe(false);
  });
});

describe('buildPaymentRedirectUrl', () => {
  it('preserves the callback params the failed page used to strip', () => {
    const current =
      'transaction_id=old&verified=true&verified_status=success&receipt_id=r1&amount=1500.00&provider=razorpay&razorpay_order_id=order_1&razorpay_payment_id=pay_1';

    const url = buildPaymentRedirectUrl('/billing/payment/success', 'txn-9', current);
    const params = new URLSearchParams(url.split('?')[1]);

    expect(url.startsWith('/billing/payment/success?')).toBe(true);
    expect(params.get('transaction_id')).toBe('txn-9');
    expect(params.get('verified')).toBe('true');
    expect(params.get('verified_status')).toBe('success');
    expect(params.get('receipt_id')).toBe('r1');
    expect(params.get('amount')).toBe('1500.00');
    expect(params.get('provider')).toBe('razorpay');
    expect(params.get('razorpay_order_id')).toBe('order_1');
    expect(params.get('razorpay_payment_id')).toBe('pay_1');
  });

  it('drops the keys it is told to drop', () => {
    const url = buildPaymentRedirectUrl(
      '/billing/payment/failed',
      'txn-9',
      'transaction_id=txn-9&verified=true&verified_status=success&amount=10',
      ['verified', 'verified_status']
    );
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('verified')).toBeNull();
    expect(params.get('verified_status')).toBeNull();
    expect(params.get('amount')).toBe('10');
  });

  it('accepts a URLSearchParams and always sets transaction_id', () => {
    const url = buildPaymentRedirectUrl(
      '/billing/payment/success',
      'txn-9',
      new URLSearchParams('reason=user_cancelled'),
      ['reason']
    );
    expect(url).toBe('/billing/payment/success?transaction_id=txn-9');
  });
});
