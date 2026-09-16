// lib/services/payments/razorpay/qr-code.ts
//
// Razorpay's QR Codes API (/v1/payments/qr_codes).
//
// WHY A QR AND NOT CHECKOUT. Billing sends the payer to a Razorpay-hosted page.
// That works when the payer is the person holding the browser. At a sales counter
// they are not: the cashier owns the session, and the customer is standing on the
// other side of the till with their own phone. Redirecting would mean handing a
// staff session to a customer, and it would unmount the POS screen — losing the
// cart to pay for it. A QR decouples the two: the cashier's screen stays theirs and
// the customer pays from their own device.
//
// Two properties of this API are the reason it is worth using over the plain
// `upi://pay` deeplink the POS builds today:
//   - `usage=single_use` — Razorpay closes the QR after the first successful
//     payment, so a double charge is prevented by the gateway rather than by our
//     own bookkeeping.
//   - `fixed_amount` + `payment_amount` — the customer cannot edit the amount,
//     which a deeplink's `am=` parameter permits in some UPI apps.
//
// Everything goes through razorpayRequest, so Basic auth, the transient-only retry
// policy (502/503/504 and nothing else) and error shaping are inherited unchanged.

import type { Paise } from '../amount';
import type { PaymentModule } from '../provider';
import type { RazorpayQrCode, RazorpayPayment } from './types';
import type { RazorpayApiAuth } from './credentials';
import { razorpayRequest, RazorpayApiError } from './client';

/**
 * Does a failed QR call mean "this MERCHANT ACCOUNT does not have the QR product",
 * as opposed to "this request was wrong"?
 *
 * QR Codes is provisioned per account, so a caller that can also collect another way
 * wants to fall back rather than fail. But the distinction decides whether an error
 * is SWALLOWED or SURFACED, so it is drawn narrowly:
 *
 *   - 404 — the observed shape of an unprovisioned product: the route itself is
 *     absent. This is what produced "The requested URL was not found on the server."
 *     against the common env account on 2026-07-30.
 *   - 400 — only when Razorpay's own description names the feature. A 400 about the
 *     amount, the close_by or a note is OUR bug, and silently collecting through a
 *     different instrument would hide it behind a working-but-wrong flow forever.
 *   - anything else (401 bad keys, 429, 5xx) is a real failure and must propagate.
 */
export function isQrProductUnavailable(err: unknown): boolean {
  if (!(err instanceof RazorpayApiError)) return false;
  if (err.status === 404) return true;
  if (err.status !== 400) return false;
  return /not\s+(enabled|activated|available|supported|allowed)|feature|not\s+subscribed|access\s+denied/i.test(
    err.message,
  );
}

/** Razorpay caps a note VALUE at 256 chars and the number of notes at 15. */
const NOTE_VALUE_MAX = 240;
const NOTE_COUNT_MAX = 15;

function clampNote(value: string): string {
  return value.length > NOTE_VALUE_MAX ? value.slice(0, NOTE_VALUE_MAX) : value;
}

export interface CreateQrCodeArgs {
  /** Our own reference for this collection attempt. Echoed back in notes. */
  transactionRef: string;
  amountPaise: Paise;
  /** Module that originated the payment — the webhook routes on this. */
  module: PaymentModule;
  /** Unix SECONDS at which Razorpay should stop accepting payment. */
  closeBy: number;
  /** Shown in the customer's UPI app. Keep it recognisable on a bank statement. */
  name: string;
  description?: string;
  notes?: Record<string, string>;
}

export async function createQrCode(
  args: CreateQrCodeArgs,
  auth: RazorpayApiAuth,
): Promise<RazorpayQrCode> {
  const params = new URLSearchParams();
  params.set('type', 'upi_qr');
  params.set('name', args.name);
  // single_use is load-bearing: it is what makes a second payment against the same
  // QR impossible at the gateway.
  params.set('usage', 'single_use');
  // '1', NOT 'true'. This body is form-encoded, so every value reaches Razorpay as a
  // string, and their validator (Laravel) accepts only true/false/1/0/"1"/"0" for a
  // boolean — the string "true" is rejected with "The fixed amount field must be true
  // or false.", which reads like it is telling you to send exactly what you just sent.
  // create-order.ts has always sent payment_capture as '1' for the same reason.
  params.set('fixed_amount', '1');
  params.set('payment_amount', String(args.amountPaise));
  params.set('close_by', String(args.closeBy));
  if (args.description) params.set('description', clampNote(args.description));

  // Always tag notes.module so the webhook handler can route by it — same contract
  // as create-order.ts. Without this the credit cannot be attributed to a module
  // and the payment is stranded.
  params.set('notes[module]', args.module);
  params.set('notes[transaction_ref]', clampNote(args.transactionRef));

  let noteCount = 2;
  for (const [k, v] of Object.entries(args.notes ?? {})) {
    if (noteCount >= NOTE_COUNT_MAX) break;
    params.set(`notes[${k}]`, clampNote(v));
    noteCount += 1;
  }

  return razorpayRequest<RazorpayQrCode>('POST', '/payments/qr_codes', auth, params);
}

/** Current state of a QR — used by the reconciliation sweep. */
export async function getQrCode(
  qrCodeId: string,
  auth: RazorpayApiAuth,
): Promise<RazorpayQrCode> {
  return razorpayRequest<RazorpayQrCode>('GET', `/payments/qr_codes/${qrCodeId}`, auth);
}

/**
 * Every payment credited against a QR.
 *
 * This is the PULL side of the same doctrine `dualInquiry` follows for orders: a
 * webhook can be missed, misconfigured, or simply absent (local development has no
 * webhook at all), so the caller must also be able to ask. Whoever polls a pending
 * QR should use this to confirm rather than waiting on the webhook alone.
 */
export async function getQrCodePayments(
  qrCodeId: string,
  auth: RazorpayApiAuth,
): Promise<RazorpayPayment[]> {
  const res = await razorpayRequest<{ entity: 'collection'; count: number; items: RazorpayPayment[] }>(
    'GET',
    `/payments/qr_codes/${qrCodeId}/payments`,
    auth,
  );
  return res?.items ?? [];
}

/**
 * Close a QR so it can no longer be paid.
 *
 * Call this when the counter cancels or times out. Do NOT rely on `close_by` alone:
 * Razorpay enforces its own minimum lifetime, so a QR may legitimately remain
 * payable after our own shorter counter timeout has elapsed. Closing explicitly is
 * what makes the two agree.
 */
export async function closeQrCode(
  qrCodeId: string,
  auth: RazorpayApiAuth,
): Promise<RazorpayQrCode> {
  return razorpayRequest<RazorpayQrCode>('POST', `/payments/qr_codes/${qrCodeId}/close`, auth);
}
