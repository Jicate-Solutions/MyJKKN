// lib/services/payments/razorpay/payer-details.ts
//
// Who paid, how, and from where — read off a Razorpay payment entity.
//
// WHY THIS IS ONE FUNCTION AND NOT THREE INLINE BLOCKS.
//
// A counter payment can be confirmed by three independent paths: the browser
// callback, the cashier's poll, and the webhook. Whichever gets there first writes
// the row. If each dug these fields out of the payload itself, they would drift —
// one would forget acquirer_data, another would read `upi.vpa` instead of `vpa`, and
// the answer to "who paid?" would then depend on which path happened to win a race
// the user cannot see. Every path calls this, so the answer is the same either way.
//
// Everything here is ALREADY stored in gateway_response. This exists so the data can
// be queried, indexed and shown, not to capture anything new.
//
// Deliberately tolerant of junk: a failed order stores the ORDER entity, which has
// none of these fields, and a webhook payload can be shaped however Razorpay likes.
// Missing means null, never a throw — a payment must not fail to record because a
// display field was absent.

/** The projected columns on ims_gateway_payments. */
export interface PayerDetailColumns {
  /** upi | card | netbanking | wallet | emi — what the customer ACTUALLY used. */
  gateway_method: string | null;
  payer_vpa: string | null;
  payer_contact: string | null;
  payer_email: string | null;
  payer_bank: string | null;
  payer_wallet: string | null;
  /** Acquirer RRN — what appears on the bank statement. The reconciliation key. */
  bank_rrn: string | null;
  upi_transaction_id: string | null;
  gateway_fee_paise: number | null;
  gateway_tax_paise: number | null;
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function paise(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Project a Razorpay payment entity onto the payer columns.
 *
 * Pass the `payment` entity — not an order, and not the webhook envelope.
 */
export function payerDetailsFrom(payment: unknown): PayerDetailColumns {
  const p = (payment ?? {}) as Record<string, any>;

  // Razorpay reports the payer's UPI id in two places and they can disagree in
  // edge cases; the top-level `vpa` is the documented one, `upi.vpa` the fallback
  // seen on some intent-flow payloads.
  const vpa = str(p.vpa) ?? str(p?.upi?.vpa);

  const acquirer = (p.acquirer_data ?? {}) as Record<string, any>;

  return {
    gateway_method: str(p.method),
    payer_vpa: vpa,
    payer_contact: str(p.contact),
    payer_email: str(p.email),
    payer_bank: str(p.bank),
    payer_wallet: str(p.wallet),
    bank_rrn: str(acquirer.rrn),
    upi_transaction_id: str(acquirer.upi_transaction_id),
    gateway_fee_paise: paise(p.fee),
    gateway_tax_paise: paise(p.tax),
  };
}

/**
 * A one-line description of the payer, for a table cell or a receipt.
 * Falls back through the methods in the order they identify a payer.
 */
export function describePayer(cols: Partial<PayerDetailColumns>): string {
  if (cols.payer_vpa) return cols.payer_vpa;
  if (cols.payer_wallet) return `${cols.payer_wallet} wallet`;
  if (cols.payer_bank) return `${cols.payer_bank} netbanking`;
  if (cols.gateway_method === 'card') return 'Card';
  return cols.gateway_method ?? '—';
}
