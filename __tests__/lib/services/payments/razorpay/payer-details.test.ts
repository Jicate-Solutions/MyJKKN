/**
 * The payer extractor is shared by all three paths that can confirm a counter
 * payment — browser callback, cashier poll, webhook. Whichever wins is a race the
 * user cannot see, so the answer to "who paid?" must not depend on it. These tests
 * pin that, plus the tolerance the money path needs: a display field that is absent
 * or malformed must never take a payment recording down with it.
 */
import { describe, it, expect } from 'vitest';
import {
  payerDetailsFrom,
  describePayer,
} from '@/lib/services/payments/razorpay/payer-details';

/** The real payload Razorpay returned for our first live counter payment. */
const REAL_UPI_PAYMENT = {
  id: 'pay_TJyiBA5pQOGkR7',
  entity: 'payment',
  amount: 100,
  currency: 'INR',
  status: 'captured',
  order_id: 'order_TJyfFzU6rQcvKj',
  method: 'upi',
  captured: true,
  vpa: 'success@razorpay',
  upi: { vpa: 'success@razorpay', flow: 'intent' },
  bank: null,
  wallet: null,
  card_id: null,
  email: 'sroja@jkkn.ac.in',
  contact: '+918610730916',
  fee: 0,
  tax: 0,
  acquirer_data: {
    rrn: '622063216360',
    upi_transaction_id: 'A2617F33CEAF3514160A2EE172408561',
  },
};

describe('payerDetailsFrom', () => {
  it('extracts every payer field from a real UPI payment', () => {
    const cols = payerDetailsFrom(REAL_UPI_PAYMENT);

    expect(cols.gateway_method).toBe('upi');
    expect(cols.payer_vpa).toBe('success@razorpay');
    expect(cols.payer_contact).toBe('+918610730916');
    expect(cols.payer_email).toBe('sroja@jkkn.ac.in');
    // The bank statement reference — what reconciliation actually turns on.
    expect(cols.bank_rrn).toBe('622063216360');
    expect(cols.upi_transaction_id).toBe('A2617F33CEAF3514160A2EE172408561');
    expect(cols.gateway_fee_paise).toBe(0);
    expect(cols.gateway_tax_paise).toBe(0);
  });

  it('falls back to upi.vpa when the top-level vpa is missing', () => {
    const { vpa: _dropped, ...withoutTopLevel } = REAL_UPI_PAYMENT;
    expect(payerDetailsFrom(withoutTopLevel).payer_vpa).toBe('success@razorpay');
  });

  it('records what a CARD customer actually used', () => {
    // The sale still books as upi_qr (the till's tender type), so gateway_method is
    // the only place the truth survives.
    const cols = payerDetailsFrom({
      entity: 'payment', method: 'card', card_id: 'card_X', vpa: null,
      bank: null, wallet: null, contact: '+919999999999', email: 'a@b.c',
      fee: 236, tax: 36, acquirer_data: { rrn: '111222333444' },
    });

    expect(cols.gateway_method).toBe('card');
    expect(cols.payer_vpa).toBeNull();
    expect(cols.bank_rrn).toBe('111222333444');
    expect(cols.gateway_fee_paise).toBe(236);
  });

  it('survives an ORDER entity — the shape a failed payment leaves behind', () => {
    // createPaymentSession stores the order when Razorpay accepts it but no payment
    // ever happens. It has none of these fields; nulls, not a throw.
    const cols = payerDetailsFrom({
      id: 'order_X', entity: 'order', amount: 100, status: 'created',
    });

    expect(cols.gateway_method).toBeNull();
    expect(cols.payer_vpa).toBeNull();
    expect(cols.bank_rrn).toBeNull();
    expect(cols.gateway_fee_paise).toBeNull();
  });

  it('never throws on null, undefined or junk', () => {
    for (const input of [null, undefined, {}, 'nonsense', 42, []]) {
      expect(() => payerDetailsFrom(input)).not.toThrow();
      expect(payerDetailsFrom(input).payer_vpa).toBeNull();
    }
  });

  it('treats blank strings as absent, so the UI shows "—" not an empty cell', () => {
    const cols = payerDetailsFrom({ entity: 'payment', method: '  ', vpa: '', bank: '   ' });
    expect(cols.gateway_method).toBeNull();
    expect(cols.payer_vpa).toBeNull();
    expect(cols.payer_bank).toBeNull();
  });

  it('does not turn a missing fee into 0 — unknown and free are different', () => {
    expect(payerDetailsFrom({ entity: 'payment' }).gateway_fee_paise).toBeNull();
    expect(payerDetailsFrom({ entity: 'payment', fee: 0 }).gateway_fee_paise).toBe(0);
  });
});

describe('describePayer', () => {
  it('prefers the UPI id, then wallet, then bank, then the method', () => {
    expect(describePayer({ payer_vpa: 'a@okhdfc', gateway_method: 'upi' })).toBe('a@okhdfc');
    expect(describePayer({ payer_wallet: 'phonepe', gateway_method: 'wallet' })).toBe('phonepe wallet');
    expect(describePayer({ payer_bank: 'HDFC', gateway_method: 'netbanking' })).toBe('HDFC netbanking');
    expect(describePayer({ gateway_method: 'card' })).toBe('Card');
    expect(describePayer({})).toBe('—');
  });
});
