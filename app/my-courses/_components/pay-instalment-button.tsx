'use client';

// Pay one instalment with Razorpay Checkout.
//
// The only client-side piece of the payment flow, and it is deliberately thin:
// it asks the server to create an order, opens Checkout with what comes back,
// and hands the result to the server to verify. It never sees an amount it can
// influence, never sees a key secret, and its claim that a payment succeeded is
// re-checked server-side against Razorpay before a bill is credited.
//
// The Checkout script is loaded ON DEMAND rather than in the page head: most
// visits to /my-courses do not pay anything, and a third-party script on every
// render of a page that shows somebody's fee balance is not worth the default.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CreditCard, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/** Resolves once Checkout is available. Repeated calls reuse the same tag. */
function loadCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    if (window.Razorpay) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('checkout failed to load')));
      return;
    }

    const tag = document.createElement('script');
    tag.src = CHECKOUT_SRC;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('checkout failed to load'));
    document.body.appendChild(tag);
  });
}

export function PayInstalmentButton({
  billId,
  amountLabel,
}: {
  billId: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    if (busy) return;
    setBusy(true);

    try {
      const res = await fetch('/api/courses/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId }),
      });
      const order = await res.json().catch(() => ({}));

      if (!res.ok || !order?.ok) {
        toast.error(order?.error ?? 'Could not start the payment.');
        setBusy(false);
        return;
      }

      await loadCheckout();
      if (!window.Razorpay) throw new Error('checkout unavailable');

      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'JKKN Institutions',
        description: order.description,
        prefill: order.prefill,
        notes: { bill_number: order.billNumber },
        theme: { color: '#18181b' },

        handler: async (response: Record<string, string>) => {
          // Razorpay has taken the money. Whether the BILL is credited is
          // decided by the server, which re-reads the captured amount from
          // Razorpay rather than trusting anything in this callback.
          try {
            const verify = await fetch('/api/courses/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response),
            });
            const result = await verify.json().catch(() => ({}));

            if (verify.status === 202) {
              // Paid, but the gateway state could not be read yet. Never tell
              // someone to try again — that is how a person pays twice.
              toast.message(result?.error ?? 'Your payment is being confirmed.');
            } else if (!verify.ok || !result?.ok) {
              toast.error(result?.error ?? 'We could not confirm your payment.');
            } else {
              toast.success(
                result.alreadyRecorded ? 'This instalment is already paid.' : 'Payment received.',
              );
              // Land back on the portal with the paid instalment named, so the
              // page can confirm what just happened rather than silently
              // re-rendering a row that now says "Paid". replace(), not push():
              // the Razorpay modal is not a history entry a Back press should
              // return to.
              router.replace(`/my-courses?paid=${encodeURIComponent(order.billNumber)}`);
            }
          } catch {
            toast.error(
              'Your payment went through but we could not confirm it here. Contact the institution before paying again.',
            );
          } finally {
            // Refresh either way: the server component re-reads the balances,
            // so the screen reflects whatever actually landed.
            setBusy(false);
            router.refresh();
          }
        },

        modal: {
          // Dismissing is not a failure and must not leave the button spinning.
          ondismiss: () => setBusy(false),
        },
      });

      checkout.open();
    } catch (e: any) {
      toast.error(
        e?.message === 'checkout failed to load'
          ? 'Could not reach the payment gateway. Check your connection and try again.'
          : 'Could not start the payment.',
      );
      setBusy(false);
    }
  };

  return (
    <Button size="sm" onClick={pay} disabled={busy}>
      {busy ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <CreditCard className="mr-1.5 h-3.5 w-3.5" />
      )}
      Pay {amountLabel}
    </Button>
  );
}
