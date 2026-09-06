'use client';

// Razorpay HOSTED Checkout redirect (CollectNow / HDFC-mandated flow).
//
// Replaces the old Standard Checkout (checkout.js modal) launcher. Razorpay's
// CollectNow program requires the *hosted* checkout: the browser is fully
// redirected to Razorpay's payment page (api.razorpay.com) instead of opening a
// modal over our own page.
//
// How it works: we render an auto-submitting <form> that POSTs the order to
// https://api.razorpay.com/v1/checkout/embedded with callback_url + cancel_url.
// On payment, Razorpay POSTs razorpay_order_id / razorpay_payment_id /
// razorpay_signature back to /api/billing/payment/callback — the SAME endpoint
// the modal used — which verifies the HMAC signature + runs the dual inquiry
// (GET /orders + GET /payments) server-side before marking the txn successful.
// So only the *launch* mechanism changes; verification is unchanged.

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

// Razorpay hosted/embedded checkout endpoint (see CollectNow "hosted" docs).
const RAZORPAY_HOSTED_CHECKOUT_URL = 'https://api.razorpay.com/v1/checkout/embedded';

interface Props {
  razorpayKeyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: 'INR';
  transactionId: string;
  customer: { name?: string; email?: string; phone?: string };
  description?: string;
  // Retained for API parity with the old launcher. The hosted flow navigates the
  // whole browser away, so there is nothing to "close" — callers may still pass it.
  onClose?: () => void;

  // ── Reuse hooks ───────────────────────────────────────────────────────────
  // This component is generic apart from the two URLs it used to hardcode, so
  // other modules collecting through hosted checkout (IMS counter sales) point
  // them at their own callback rather than forking the file. Both default to the
  // billing paths, so billing's behaviour is byte-identical to before.
  /** Path Razorpay POSTs the signed result to. Must verify server-side. */
  callbackPath?: string;
  /** Where Razorpay sends the browser if the customer abandons the payment. */
  cancelUrl?: string;
  /** Merchant name shown on Razorpay's page. */
  merchantName?: string;
  /**
   * Payment method the hosted page opens on ('upi', 'card', …).
   *
   * A bias, not a restriction — Razorpay still offers the others. The counter uses
   * 'upi' so the customer lands straight on the QR, which is the flow the till
   * records the sale as.
   */
  prefillMethod?: string;
}

export function RazorpayHostedRedirect(props: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  // Canonical app origin for the callback/cancel URLs Razorpay redirects back to.
  // NEXT_PUBLIC_APP_URL is inlined at build time (https://www.jkkn.ai in prod);
  // window.location.origin is the localhost/dev fallback.
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const callbackUrl = `${appOrigin}${props.callbackPath ?? '/api/billing/payment/callback'}`;
  const cancelUrl =
    props.cancelUrl ??
    `${appOrigin}/billing/payment/failed` +
      `?transaction_id=${encodeURIComponent(props.transactionId)}&reason=user_cancelled`;

  useEffect(() => {
    if (submitted.current) return;
    if (!formRef.current) return;
    submitted.current = true;
    // Full-page navigation to Razorpay's hosted checkout.
    formRef.current.submit();
  }, []);

  // Field names match Razorpay's hosted-checkout form contract. Order amount is
  // authoritative (taken from order_id); amount/currency are sent for display.
  const fields: Record<string, string> = {
    key_id: props.razorpayKeyId,
    order_id: props.razorpayOrderId,
    amount: String(props.amountPaise),
    currency: props.currency,
    name: props.merchantName ?? 'JKKN',
    description: props.description ?? 'Bill payment',
    'prefill[name]': props.customer.name ?? '',
    'prefill[email]': props.customer.email ?? '',
    'prefill[contact]': props.customer.phone ?? '',
    'notes[transaction_id]': props.transactionId,
    callback_url: callbackUrl,
    cancel_url: cancelUrl,
    ...(props.prefillMethod ? { 'prefill[method]': props.prefillMethod } : {}),
  };

  return (
    <>
      <form
        ref={formRef}
        method="POST"
        action={RAZORPAY_HOSTED_CHECKOUT_URL}
        className="hidden"
        aria-hidden="true"
      >
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </form>

      {/* Brief feedback while the browser navigates to Razorpay's hosted page. */}
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Redirecting to the secure Razorpay payment page…
        </p>
      </div>
    </>
  );
}
