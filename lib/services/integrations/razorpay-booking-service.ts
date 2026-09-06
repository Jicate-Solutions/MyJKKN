// lib/services/integrations/razorpay-booking-service.ts
//
// Razorpay integration for the Universal Booking module (Wave-3 scaffold).
// Spec: specs/universal-booking-module-2026-06-12.md — D-pay (paid meeting
// types: a booking is held pending until the attendee pays, then confirmed).
// Sibling to 20260612200000_room_booking_pay_to_confirm.sql on the rooms side;
// this is the meetings/Universal-Booking entry point.
//
// REUSE, NOT DUPLICATE: the live Razorpay client already in the repo does the
// HTTP, retry-on-transient, and error taxonomy work — this module is a THIN
// booking-shaped wrapper over it:
//   • razorpayRequest()  — lib/services/payments/razorpay/client.ts
//   • verifySignature()  — lib/services/payments/razorpay/verify-signature.ts
//   • RazorpayApiAuth / RazorpayOrder — the shared types
// No new HTTP client, no new HMAC code.
//
// SERVER-ONLY: RAZORPAY_KEY_SECRET lives here. NEVER import from a client
// component. (The KEY_ID is also exposed to the browser as the checkout public
// key by the page that opens Razorpay Checkout — that wiring is NOT done here;
// see NEEDS.md.)
//
// ENV-GATED: with RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET empty,
// isRazorpayBookingConfigured() returns false and the create/verify calls
// fail closed (order create returns null; verify returns false) WITHOUT
// throwing. This intentionally reads the COMMON env account only — the
// per-institution account vault (resolve-credentials.ts) is a billing concern;
// booking deposits use the platform's single env account until the Director
// decides otherwise (see NEEDS.md).
//
// Pattern: google-calendar-service.ts (env() gate + fail-closed returns).

import { razorpayRequest } from '@/lib/services/payments/razorpay/client';
import { verifySignature } from '@/lib/services/payments/razorpay/verify-signature';
import type { RazorpayApiAuth } from '@/lib/services/payments/razorpay/credentials';
import type { RazorpayOrder } from '@/lib/services/payments/razorpay/types';

const LOG_PREFIX = '[razorpay-booking]';

// ── env ──────────────────────────────────────────────────────────────────────

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

/**
 * True only when both common-env Razorpay credentials are present. Callers MUST
 * gate on this before invoking createBookingOrder — the create call also fails
 * closed (returns null), but checking here lets the book route treat a paid
 * meeting type as unavailable when payments are not configured.
 */
export function isRazorpayBookingConfigured(): boolean {
  return !!(env('RAZORPAY_KEY_ID') && env('RAZORPAY_KEY_SECRET'));
}

function auth(): RazorpayApiAuth | null {
  const keyId = env('RAZORPAY_KEY_ID');
  const keySecret = env('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

// ── types ────────────────────────────────────────────────────────────────────

export interface CreateBookingOrderInput {
  /** Amount to collect, in paise (e.g. ₹500 → 50000). Must be a positive int. */
  amountPaise: number;
  /**
   * Idempotency/audit handle echoed back as the order receipt — use the
   * booking row id (or a `booking-<id>` string) so the webhook/verify step can
   * tie the payment back to the held booking.
   */
  receipt: string;
  /** Optional key/value tags stored on the order (string values only). */
  notes?: Record<string, string>;
}

export interface CreatedBookingOrder {
  /** Razorpay order id (order_XXXX) — pass to Razorpay Checkout on the client. */
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  receipt: string;
  /**
   * The public checkout key, safe to send to the browser. Provided here so the
   * book route doesn't re-read env; it's the KEY_ID, never the secret.
   */
  keyId: string;
}

export interface VerifyBookingPaymentInput {
  /** order_XXXX returned by createBookingOrder. */
  orderId: string;
  /** pay_XXXX from the Checkout success handler. */
  paymentId: string;
  /** razorpay_signature from the Checkout success handler. */
  signature: string;
}

// ── service ──────────────────────────────────────────────────────────────────

/**
 * Create a Razorpay order to collect a booking deposit. Returns the order
 * handle (+ public key) for Razorpay Checkout, or null when payments are not
 * configured or the API call fails (the book route then declines the paid
 * booking rather than confirming an unpaid hold — fail closed).
 */
export async function createBookingOrder(
  input: CreateBookingOrderInput,
): Promise<CreatedBookingOrder | null> {
  const a = auth();
  if (!a) return null;

  const amount = Math.round(input.amountPaise);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error(`${LOG_PREFIX} invalid amountPaise:`, input.amountPaise);
    return null;
  }

  const params = new URLSearchParams();
  params.set('amount', String(amount));
  params.set('currency', 'INR');
  params.set('receipt', input.receipt);
  params.set('payment_capture', '1');
  // Tag the source so a shared webhook handler can route booking deposits.
  params.set('notes[source]', 'universal-booking');
  for (const [k, v] of Object.entries(input.notes ?? {})) {
    params.set(`notes[${k}]`, v);
  }

  try {
    const order = await razorpayRequest<RazorpayOrder>('POST', '/orders', a, params);
    return {
      orderId: order.id,
      amountPaise: order.amount,
      currency: 'INR',
      receipt: order.receipt,
      keyId: a.keyId,
    };
  } catch (e) {
    console.error(`${LOG_PREFIX} order create failed:`, (e as Error).message);
    return null;
  }
}

/**
 * Verify a Razorpay Checkout success callback for a booking deposit. Returns
 * true ONLY when the HMAC signature over `orderId|paymentId` matches the key
 * secret. Returns false when payments are not configured or any field is
 * missing — callers MUST treat false as "do not confirm the booking".
 *
 * Reuses the shared verifySignature() so booking and billing share one
 * signature implementation.
 */
export function verifyBookingPayment(input: VerifyBookingPaymentInput): boolean {
  const a = auth();
  if (!a) return false;
  if (!input.orderId || !input.paymentId || !input.signature) return false;
  return verifySignature(
    {
      gatewayOrderId: input.orderId,
      gatewayPaymentId: input.paymentId,
      signature: input.signature,
    },
    a.keySecret,
  );
}
