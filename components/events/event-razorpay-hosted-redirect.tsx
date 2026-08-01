'use client';

// Razorpay HOSTED Checkout redirect for the events module (tournament, and any
// future event type). Mirrors components/billing/razorpay-hosted-redirect.tsx —
// same hosted-checkout mechanics (CollectNow-mandated full-page redirect), but
// takes eventId + a relative cancelPath so each event type's own callback
// route (e.g. /api/events/tournament/[eventId]/payment/callback) handles the
// POST-back, instead of hardcoding billing's endpoint.
//
// How it works: renders an auto-submitting <form> that POSTs the order to
// https://api.razorpay.com/v1/checkout/embedded with callback_url +
// cancel_url. On payment, Razorpay POSTs razorpay_order_id /
// razorpay_payment_id / razorpay_signature back to the events callback route,
// which verifies the HMAC signature + dual inquiry server-side.

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

const RAZORPAY_HOSTED_CHECKOUT_URL = 'https://api.razorpay.com/v1/checkout/embedded';

interface Props {
  eventId: string;
  razorpayKeyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: 'INR';
  customer: { name?: string; email?: string; phone?: string };
  description?: string;
  /** Relative path (with leading /) Razorpay sends the user back to on cancel. */
  cancelPath: string;
  /**
   * Relative path (with leading /) Razorpay POSTs the signed result to.
   * Defaults to the tournament callback so the original caller is unchanged.
   * General events pass their own route — both verify identically (the settle
   * step looks the transaction up by razorpay_order_id), but each redirects the
   * payer back into its own public flow afterwards.
   */
  callbackPath?: string;
}

export function EventRazorpayHostedRedirect(props: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const callbackUrl = `${appOrigin}${
    props.callbackPath ?? `/api/events/tournament/${props.eventId}/payment/callback`
  }`;
  const cancelUrl = `${appOrigin}${props.cancelPath}`;

  useEffect(() => {
    if (submitted.current) return;
    if (!formRef.current) return;
    submitted.current = true;
    formRef.current.submit();
  }, []);

  const fields: Record<string, string> = {
    key_id: props.razorpayKeyId,
    order_id: props.razorpayOrderId,
    amount: String(props.amountPaise),
    currency: props.currency,
    name: 'JKKN',
    description: props.description ?? 'Event registration',
    'prefill[name]': props.customer.name ?? '',
    'prefill[email]': props.customer.email ?? '',
    'prefill[contact]': props.customer.phone ?? '',
    callback_url: callbackUrl,
    cancel_url: cancelUrl,
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

      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Redirecting to the secure Razorpay payment page…
        </p>
      </div>
    </>
  );
}
