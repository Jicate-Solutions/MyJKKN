// lib/services/ims/checkout-prefill.ts
//
// Who Razorpay's hosted checkout page is told it is talking to.
//
// THIS IS NOT WHO BOUGHT THE GOODS. That distinction is the whole reason this is a
// named function rather than three `||` chains inlined at the call site.
//
// Razorpay's hosted checkout will not display ANY payment method — the UPI QR the
// counter actually uses included — until it has a contact and an email. A walk-in
// gives us neither, so we were posting empty prefill fields and the page stopped on
// its contact screen before every single sale. The cashier then typed their own
// number to get past it, all day, for every customer. The first live counter payment
// records exactly that: `contact: '+918610730916'`, the cashier's own.
//
// So the fallback here formalises what was already happening by hand. What it must
// NOT do is leak into ims_gateway_payments.customer_name / customer_phone: those stay
// the real customer or null, because the cashier's number on every walk-in receipt
// and in every sales report would be a lie the reports cannot recover from.
//
// Known consequence, accepted: payer_contact / payer_email (projected off the
// Razorpay payment by payerDetailsFrom) become systematically the cashier's. They
// were already, whenever a walk-in did not volunteer details. payer_vpa and bank_rrn
// still identify whoever actually paid, which is what reconciliation reads.

import { normalizePhone } from '@/lib/utils/phone';

export interface CashierContact {
  fullName: string | null;
  phone: string | null;
  email: string | null;
}

export interface CheckoutPrefillInput {
  /** What the counter captured about the customer. Blank for a walk-in. */
  customerName?: string | null;
  customerPhone?: string | null;
  /** The signed-in cashier, from their profiles row. */
  cashier: CashierContact;
  /** Last-resort display name, so the page is never headed by an empty string. */
  storeName: string;
}

export interface CheckoutPrefill {
  name: string;
  /** E.164, the form Razorpay wants. Empty when nothing usable is on file. */
  phone: string;
  email: string;
}

/**
 * Resolve the prefill for one checkout.
 *
 * The customer wins wherever the counter actually captured them — a student or
 * patient sale should reach Razorpay as that person, not as whoever is on the till.
 * The cashier is the fallback, never an override.
 *
 * Degrades quietly: a cashier with no phone on file yields an empty string and
 * Razorpay asks, exactly as it did before. Never worse than today.
 */
export function resolveCheckoutPrefill(input: CheckoutPrefillInput): CheckoutPrefill {
  const customerName = input.customerName?.trim();
  const customerPhone = input.customerPhone?.trim();

  return {
    name: customerName || input.cashier.fullName?.trim() || input.storeName,
    // normalizePhone returns '' for null/empty, so an absent number on both sides
    // stays absent rather than becoming a '+' or some other half-formed value.
    phone: normalizePhone(customerPhone || input.cashier.phone || ''),
    email: input.cashier.email?.trim() || '',
  };
}
