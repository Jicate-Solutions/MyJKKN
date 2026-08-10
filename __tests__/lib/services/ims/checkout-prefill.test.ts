/**
 * The prefill decides what Razorpay's hosted page is told, and it sits one field away
 * from what the sale records. Two things are pinned here:
 *
 *   - a walk-in reaches Razorpay with SOMETHING, so the page stops asking the cashier
 *     for a contact before every single sale;
 *   - a customer the counter actually captured is never overwritten by the cashier,
 *     because a student's receipt reaching Razorpay as the person on the till is the
 *     failure this fallback could plausibly introduce.
 */
import { describe, it, expect } from 'vitest';
import { resolveCheckoutPrefill } from '@/lib/services/ims/checkout-prefill';

/** The cashier who took our first live counter payments. */
const CASHIER = {
  fullName: 'Sroja',
  phone: '8610730916',
  email: 'sroja@jkkn.ac.in',
};

const STORE = 'Dental Warehouse';

describe('resolveCheckoutPrefill', () => {
  it('falls back to the cashier for a walk-in, in the form Razorpay wants', () => {
    const prefill = resolveCheckoutPrefill({
      customerName: null,
      customerPhone: null,
      cashier: CASHIER,
      storeName: STORE,
    });

    expect(prefill.name).toBe('Sroja');
    // E.164 — what Razorpay's live payment record already showed for this cashier.
    expect(prefill.phone).toBe('+918610730916');
    expect(prefill.email).toBe('sroja@jkkn.ac.in');
  });

  it('lets the customer win when the counter captured them', () => {
    const prefill = resolveCheckoutPrefill({
      customerName: 'Arun Kumar',
      customerPhone: '9150621922',
      cashier: CASHIER,
      storeName: STORE,
    });

    expect(prefill.name).toBe('Arun Kumar');
    expect(prefill.phone).toBe('+919150621922');
  });

  it('treats whitespace-only customer fields as absent', () => {
    // The inputs are free-text boxes; a stray space must not defeat the fallback and
    // put the counter back on Razorpay's contact screen.
    const prefill = resolveCheckoutPrefill({
      customerName: '   ',
      customerPhone: '  ',
      cashier: CASHIER,
      storeName: STORE,
    });

    expect(prefill.name).toBe('Sroja');
    expect(prefill.phone).toBe('+918610730916');
  });

  it('normalizes a phone the cashier typed with a leading zero or spaces', () => {
    expect(
      resolveCheckoutPrefill({
        customerPhone: '09150 621922',
        cashier: CASHIER,
        storeName: STORE,
      }).phone,
    ).toBe('+919150621922');
  });

  it('degrades to empty rather than a half-formed number when nothing is on file', () => {
    // Razorpay then asks, exactly as it did before this fallback existed. What must
    // NOT happen is a bare '+' or a truncated number reaching the checkout.
    const prefill = resolveCheckoutPrefill({
      cashier: { fullName: null, phone: null, email: null },
      storeName: STORE,
    });

    expect(prefill.phone).toBe('');
    expect(prefill.email).toBe('');
    // The page is still headed by something a customer can recognise.
    expect(prefill.name).toBe(STORE);
  });
});
