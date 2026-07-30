'use client';

// components/ims/gateway-qr-payment.tsx
//
// Gateway-verified UPI QR for the counter.
//
// The difference from upi-qr-payment.tsx, which sits beside it, is who decides the
// payment happened. There, the cashier types a reference number and clicks a button;
// nothing is checked. Here Razorpay confirms the credit and the amount, and this
// component only watches.
//
// Two consequences shape the code below:
//
//   - IT NEVER CALLS onCreateSale. By the time the screen says paid, the server has
//     already booked the sale from the cart it priced when the QR was opened. Asking
//     the browser to book it again would reintroduce exactly the gap this removes.
//
//   - 'paid' IS NOT THE FINISH LINE. Terminal is `sale_id`. Stopping at paid would
//     tell a cashier the sale is done while it is still being booked, and if booking
//     then failed they would have no receipt and no idea why.

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ImsCartItem } from '@/types/ims';

interface GatewayQrPaymentProps {
  storeId: string;
  items: ImsCartItem[];
  customerType: string;
  customerName: string;
  customerPhone: string;
  /** Called once the SERVER has booked the sale. Receives the new sale id. */
  onPaid: (saleId: string) => void;
  onCancel: () => void;
}

type Phase = 'opening' | 'waiting' | 'booking' | 'done' | 'error';

interface StatusResponse {
  id: string;
  status: string;
  amount: number;
  sale_id: string | null;
  sale_number: string | null;
  expires_at: string;
  late_credit: boolean;
  finalize_error: string | null;
}

const POLL_MS = 3000;

export function GatewayQrPayment({
  storeId,
  items,
  customerType,
  customerName,
  customerPhone,
  onPaid,
  onCancel,
}: GatewayQrPaymentProps) {
  const [phase, setPhase] = useState<Phase>('opening');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Guards React 18 StrictMode's double-invoke in development from opening two
  // QRs — which would be two live collection instruments for one cart.
  const openedRef = useRef(false);

  const openQr = useCallback(async () => {
    setPhase('opening');
    setMessage(null);
    try {
      const res = await fetch('/api/ims/payment/gateway/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          // Only what to buy — never what it costs. The server prices it.
          lines: items.map((i) => ({
            item_id: i.item_id,
            quantity: i.quantity,
            discount_percent: i.discount_percent ?? 0,
          })),
          customerType,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not open the payment');

      setPaymentId(body.id);
      setQrUrl(body.qrImageUrl);
      setAmount(body.amount);
      setSecondsLeft(Math.max(0, Math.floor((new Date(body.expiresAt).getTime() - Date.now()) / 1000)));
      setPhase('waiting');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not open the payment');
      setPhase('error');
    }
  }, [storeId, items, customerType, customerName, customerPhone]);

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void openQr();
  }, [openQr]);

  // Countdown. Display only — expiry is decided server-side, and a late credit is
  // still honoured, so reaching zero here is not the end of the story.
  useEffect(() => {
    if (phase !== 'waiting' || secondsLeft === null) return;
    const t = setInterval(() => setSecondsLeft((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [phase, secondsLeft]);

  // Poll. This is not merely reading our own table — the endpoint asks Razorpay
  // directly and books the sale, so it is what completes the payment when no
  // webhook can arrive (always the case on localhost).
  useEffect(() => {
    if (!paymentId || (phase !== 'waiting' && phase !== 'booking')) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/ims/payment/gateway/${paymentId}/status`);
        if (!res.ok) return;
        const s: StatusResponse = await res.json();
        if (cancelled) return;

        if (s.sale_id) {
          setPhase('done');
          onPaid(s.sale_id);
          return;
        }

        if (s.status === 'paid') {
          // Money is in. Never ask for payment again from here.
          setPhase('booking');
          if (s.finalize_error) {
            setMessage('Payment received — completing the sale is taking longer than usual.');
          }
          return;
        }

        if (s.status === 'amount_mismatch') {
          setPhase('error');
          setMessage(
            'The amount paid does not match this bill. Nothing has been sold — please check with the customer before retrying.',
          );
          return;
        }

        if (s.status === 'failed' || s.status === 'cancelled') {
          setPhase('error');
          setMessage('The payment did not go through. You can try again or take payment another way.');
        }
        // 'expired' deliberately keeps polling: Razorpay may still credit it, and
        // a late credit is honoured rather than refused.
      } catch {
        // Transient — the next tick tries again.
      }
    };

    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [paymentId, phase, onPaid]);

  if (phase === 'opening') {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Opening a secure QR…</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="space-y-4 py-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Back
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              openedRef.current = false;
              void openQr();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'booking' || phase === 'done') {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
        <p className="text-sm font-medium text-green-600">Payment received</p>
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          {message ?? 'Completing the sale…'}
        </p>
      </div>
    );
  }

  const mins = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 0;
  const secs = secondsLeft !== null ? secondsLeft % 60 : 0;

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {qrUrl && (
        <div className="rounded-lg border bg-white p-3">
          {/* Razorpay serves the QR as a hosted image. */}
          <Image src={qrUrl} alt="Scan to pay" width={220} height={220} unoptimized />
        </div>
      )}

      <div className="text-center">
        <p className="text-2xl font-semibold">₹{amount?.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Ask the customer to scan with any UPI app
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Waiting for payment
        {secondsLeft !== null && secondsLeft > 0 && (
          <span className="tabular-nums">
            · {mins}:{String(secs).padStart(2, '0')}
          </span>
        )}
      </div>

      {secondsLeft === 0 && (
        <p className="text-xs text-amber-600 text-center px-4">
          The QR has passed its window. If the customer has already paid it will still
          be accepted — keep this open a moment longer.
        </p>
      )}

      <Button variant="outline" className="w-full" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
