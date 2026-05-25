'use client';

// Razorpay Checkout.js launcher (Task 19)
// Loads the checkout.js script and opens the modal as soon as it's ready.
// On payment success in the modal, posts the response form to the existing
// /api/billing/payment/callback endpoint (which already routes Razorpay
// callbacks through verifyPaymentWithGateway as of Task 15).

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Props {
  razorpayKeyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: 'INR';
  transactionId: string;
  customer: { name?: string; email?: string; phone?: string };
  description?: string;
  onClose?: () => void;
}

export function RazorpayCheckoutLauncher(props: Props) {
  const launched = useRef(false);
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (launched.current) return;
    if (typeof window === 'undefined' || !window.Razorpay) return;
    if (!scriptReady) return;
    launched.current = true;

    const rzp = new window.Razorpay({
      key: props.razorpayKeyId,
      order_id: props.razorpayOrderId,
      amount: props.amountPaise,
      currency: props.currency,
      name: 'JKKN',
      description: props.description ?? 'Bill payment',
      prefill: {
        name: props.customer.name ?? '',
        email: props.customer.email ?? '',
        contact: props.customer.phone ?? '',
      },
      notes: { transaction_id: props.transactionId },
      handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/api/billing/payment/callback';
        for (const [k, v] of Object.entries(response)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = k;
          input.value = v;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
      },
      modal: {
        ondismiss: () => {
          router.push(`/billing/payment/failed?transaction_id=${props.transactionId}&reason=user_cancelled`);
          props.onClose?.();
        },
      },
      theme: { color: '#0F766E' },
    });

    rzp.on('payment.failed', (resp: any) => {
      const reason = resp?.error?.code ?? 'gateway_error';
      router.push(`/billing/payment/failed?transaction_id=${props.transactionId}&reason=${encodeURIComponent(reason)}`);
    });

    rzp.open();
  }, [scriptReady, props, router]);

  return (
    <Script
      src="https://checkout.razorpay.com/v1/checkout.js"
      strategy="afterInteractive"
      onLoad={() => setScriptReady(true)}
    />
  );
}
