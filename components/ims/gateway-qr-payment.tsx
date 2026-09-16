'use client';

// components/ims/gateway-qr-payment.tsx
//
// Gateway-verified counter payment, collected by a QR ON THE TILL'S OWN SCREEN.
//
// WHAT THIS CHANGES vs gateway-payment.tsx, which it sits beside. That component
// hands the browser to Razorpay's hosted page and picks the payment back up when it
// returns to /ims/sales?gp=<id>. It works, but it unmounts the POS: the cashier's
// screen leaves the till, and the flow needs a return path, a URL parameter and a
// second component just to survive the round trip.
//
// A QR needs none of that. The modal stays open, the cart never leaves the page, and
// the customer pays from their own phone while the cashier keeps their session — the
// two halves of a counter transaction stop competing for one browser.
//
// WHAT IT KEEPS, because these are the rules that make the money safe:
//
//   - IT NEVER CALLS onCreateSale. The server books the sale from the cart IT priced
//     when the payment was opened. Routing that back through the browser is the gap
//     this whole path exists to close.
//
//   - 'paid' IS NOT THE FINISH LINE. Terminal is `sale_id`.
//
//   - ONCE THE MONEY IS IN, NEVER ASK FOR IT AGAIN. No failure path after `paid`
//     offers to collect; they offer to retry BOOKING.
//
// AND ONE IT ADDS: the QR may not be available. Razorpay provisions QR Codes per
// merchant account, so /create answers with the instrument it actually opened. On
// `mode: 'checkout'` this component renders the redirect instead — the counter gets
// the best flow the account supports rather than an error about a product nobody at
// the till has heard of.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2, CheckCircle2, AlertTriangle, RefreshCw, QrCode, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RazorpayHostedRedirect } from '@/components/billing/razorpay-hosted-redirect';
import { formatCurrencyINR } from '@/lib/utils/ims-receipt';
import type { ImsCartItem } from '@/lib/stores/ims-cart-store';
import type { StatusResponse } from './gateway-payment';

interface SessionResponse {
  id: string;
  mode: 'qr' | 'checkout';
  transactionRef: string;
  amount: number;
  amountPaise: number;
  storeName: string;
  description: string;
  expiresAt: string;
  /** mode === 'qr' */
  qrImageUrl?: string;
  /** mode === 'checkout' */
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  customer?: { name: string; phone: string; email: string };
}

const POLL_MS = 3000;

/** See gateway-payment.tsx — how long "paid, but no sale yet" may spin. */
const BOOKING_PATIENCE_MS = 30_000;

interface Props {
  storeId: string;
  items: ImsCartItem[];
  customerType: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  /** The SERVER booked the sale. Receives the new sale id. */
  onSaleBooked: (saleId: string) => void;
  onCancel: () => void;
}

type Phase = 'idle' | 'opening' | 'live' | 'error';

export function GatewayQrPayment({
  storeId,
  items,
  customerType,
  customerName,
  customerPhone,
  amount,
  onSaleBooked,
  onCancel,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [settled, setSettled] = useState(false);
  const [bookingStalled, setBookingStalled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  // Guards a double-click (and StrictMode's double-invoke) from opening two live
  // QRs for one cart — two payable instruments for the same goods.
  const openingRef = useRef(false);
  const paidSinceRef = useRef<number | null>(null);

  // ── Open the payment ──────────────────────────────────────────────────────
  //
  // Deliberately behind a button rather than fired on mount. Selecting a tab is a
  // cheap, easily mistaken gesture; opening a live instrument the customer can pay
  // into is not. One deliberate press separates them.
  const open = useCallback(async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setPhase('opening');
    setMessage(null);

    try {
      const res = await fetch('/api/ims/payment/gateway/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          // Only WHAT to buy — never what it costs. The server prices it.
          lines: items.map((i) => ({
            item_id: i.item_id,
            quantity: i.quantity,
            discount_percent: (i as { discount_percent?: number }).discount_percent ?? 0,
          })),
          customerType,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          prefer: 'qr',
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not open the payment');

      const opened = body as SessionResponse;
      setSession(opened);
      setPhase('live');
      // A QR exists to be SCANNED, so the full-screen view is the default rather
      // than an extra tap: the customer is across a counter with their phone out,
      // and the moment the code appears is exactly when it needs to be big. The
      // inline copy inside the modal stays as the fallback for when the cashier
      // shrinks it back down. Never for 'checkout' — there is no QR to show.
      if (opened.mode === 'qr' && opened.qrImageUrl) setZoomed(true);
    } catch (err) {
      openingRef.current = false;
      setMessage(err instanceof Error ? err.message : 'Could not open the payment');
      setPhase('error');
    }
  }, [storeId, items, customerType, customerName, customerPhone]);

  // ── Countdown ─────────────────────────────────────────────────────────────
  // Presentation only. Our expiry is not Razorpay's verdict — a credit that lands
  // after zero is still honoured, so this never stops the polling below.
  useEffect(() => {
    if (!session?.expiresAt) return;
    const ends = new Date(session.expiresAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.round((ends - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session?.expiresAt]);

  // ── Poll ──────────────────────────────────────────────────────────────────
  // Not merely re-reading our own table: the endpoint asks Razorpay directly AND
  // books the sale, so it is what completes the payment when no webhook can arrive
  // (always the case on localhost, and after any webhook outage in production).
  useEffect(() => {
    const paymentId = session?.id;
    if (!paymentId || session?.mode !== 'qr' || settled) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/ims/payment/gateway/${paymentId}/status`);
        if (!res.ok) return;
        const s: StatusResponse = await res.json();
        if (cancelled) return;

        setStatus(s);

        if (s.sale_id) {
          setSettled(true);
          onSaleBooked(s.sale_id);
          return;
        }

        if (s.status === 'paid') {
          paidSinceRef.current ??= Date.now();
          if (s.finalize_fatal) {
            setSettled(true);
            return;
          }
          if (Date.now() - paidSinceRef.current > BOOKING_PATIENCE_MS) {
            setBookingStalled(true);
          }
        }

        if (['failed', 'cancelled', 'amount_mismatch'].includes(s.status)) {
          setSettled(true);
        }
        // 'expired' deliberately keeps polling: Razorpay may still credit it, and a
        // late credit is honoured rather than refused.
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
  }, [session?.id, session?.mode, settled, onSaleBooked]);

  // ── Cancel ────────────────────────────────────────────────────────────────
  // The server closes the QR at the gateway and reports whether anything was
  // credited in the same breath. 'payment_in_flight' means money arrived as we were
  // cancelling — so we do NOT close the screen; we keep polling and let it settle
  // into a sale. Closing here would hide a payment the customer has already made.
  const cancel = useCallback(async () => {
    if (!session?.id) {
      onCancel();
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch(`/api/ims/payment/gateway/${session.id}/cancel`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.cancelled === false && body?.reason === 'payment_in_flight') {
        setMessage('A payment arrived just now — confirming it. Do not collect again.');
        setCancelling(false);
        return;
      }
    } catch {
      // Best effort. Our expires_at still bounds an un-closed QR.
    }
    setCancelling(false);
    onCancel();
  }, [session?.id, onCancel]);

  // ── The account has no QR product: use the redirect instead ───────────────
  if (phase === 'live' && session?.mode === 'checkout' && session.razorpayOrderId) {
    return (
      <RazorpayHostedRedirect
        razorpayKeyId={session.razorpayKeyId ?? ''}
        razorpayOrderId={session.razorpayOrderId}
        amountPaise={session.amountPaise}
        currency="INR"
        transactionId={session.id}
        merchantName={session.storeName}
        description={session.description}
        customer={{
          name: session.customer?.name ?? '',
          phone: session.customer?.phone ?? '',
          email: session.customer?.email ?? '',
        }}
        callbackPath="/api/ims/payment/gateway/callback"
        prefillMethod="upi"
        cancelUrl={
          (process.env.NEXT_PUBLIC_APP_URL ||
            (typeof window !== 'undefined' ? window.location.origin : '')) +
          `/ims/sales?gp=${encodeURIComponent(session.id)}&payment=cancelled`
        }
      />
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
          <Button className="flex-1" onClick={() => void open()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'opening') {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Opening a secure payment…</p>
      </div>
    );
  }

  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <QrCode className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          Show the customer a QR for {formatCurrencyINR(amount)}. They scan with any UPI
          app, and the payment is confirmed automatically — no reference number to type in.
        </p>
        <Button className="w-full" size="lg" onClick={() => void open()}>
          Show QR code
        </Button>
        <Button variant="outline" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  }

  // ── Live QR ───────────────────────────────────────────────────────────────
  const s = status;
  const moneyIsIn = s?.status === 'paid';

  if (moneyIsIn && s?.finalize_fatal) {
    // Money in, sale refused, retrying will not change that. No spinner: the reason
    // names something a person has to go and fix.
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-600" />
        <p className="text-base font-medium text-green-600">Payment received</p>
        <p className="text-sm font-medium">The sale could not be completed.</p>
        <p className="text-sm text-muted-foreground max-w-md">
          {s?.finalize_error || 'The sale was refused.'}
        </p>
        <p className="text-sm text-muted-foreground max-w-md">
          The customer has paid and the money is safe — do <strong>not</strong> take
          payment again. Fix the cause above, then use Try again.
        </p>
        <p className="text-xs text-muted-foreground font-mono">Ref {s?.id?.slice(0, 8)}</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              paidSinceRef.current = null;
              setBookingStalled(false);
              setSettled(false);
            }}
          >
            Try again
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Back to the till
          </Button>
        </div>
      </div>
    );
  }

  if (moneyIsIn) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <p className="text-base font-medium text-green-600">Payment received</p>
        {bookingStalled ? (
          <>
            <p className="text-sm font-medium">The sale has not been completed yet.</p>
            <p className="text-sm text-muted-foreground max-w-md">
              The customer has paid and the money is safe — do <strong>not</strong> take
              payment again. Check Sales History before handing over or re-selling.
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              Ref {s?.id?.slice(0, 8)}
              {s?.finalize_error ? ` · ${s.finalize_error}` : ''}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Still trying to complete it
            </div>
            <Button variant="outline" size="sm" onClick={onCancel}>
              Back to the till
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Completing the sale…
          </p>
        )}
        {/* No "collect payment again" anywhere on this screen, on purpose. */}
      </div>
    );
  }

  if (s?.status === 'amount_mismatch') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-600" />
        <p className="text-base font-medium">Amount does not match</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          The amount paid does not match this bill. Nothing has been sold — check with
          the customer before retrying.
        </p>
        <Button variant="outline" onClick={onCancel}>Close</Button>
      </div>
    );
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const expired = secondsLeft <= 0;

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {session?.qrImageUrl && (
        <>
          {/* WHAT RAZORPAY ACTUALLY RETURNS. Not a bare QR — a portrait "standee"
              poster roughly 1:2, carrying BHIM/UPI branding, the merchant name, the
              accepted-app logos and the scannable code in the middle. Constraining
              it to a SQUARE box (the first attempt used 220x220) letterboxes the
              whole poster to fit the height, which shrinks the code inside it to
              about 60px — technically visible, practically unscannable.
              So: never fix both dimensions. Bound the HEIGHT and let the width
              follow the natural aspect ratio. */}
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="rounded-lg border bg-white p-2 transition hover:shadow-md"
            title="Tap to enlarge"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={session.qrImageUrl}
              alt={`UPI QR for ${formatCurrencyINR(amount)}`}
              className="mx-auto h-auto max-h-[300px] w-auto max-w-full object-contain"
            />
          </button>
          <p className="text-[11px] text-muted-foreground">
            Tap the code to show it full screen again
          </p>
        </>
      )}

      {/* ── The full-screen scan view ─────────────────────────────────────────
          This is the DEFAULT once a QR opens, so it is a complete payment screen,
          not a lightbox: it carries the amount, the countdown and the cancel action.
          A cashier left on a bare image would have no way to read the state or stop
          the payment without first dismissing the only thing on screen.

          PORTALLED TO document.body ON PURPOSE. DialogContent is positioned with
          translate-x/y-[-50%], and a CSS transform makes an ancestor the containing
          block for `position: fixed` descendants — so rendered in place this would
          be confined to the modal box and clipped by its overflow-y-auto, which is
          the very smallness it exists to fix. The portal escapes the transform.

          It self-dismisses for free: once the payment resolves, the branches above
          return before this JSX is reached and the portal unmounts, revealing the
          "Payment received" state underneath.

          White ground regardless of theme — a scanner needs light quiet zones. */}
      {zoomed && session?.qrImageUrl && typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-white p-4">
            <p className="text-3xl font-semibold text-neutral-900">
              {formatCurrencyINR(amount)}
            </p>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={session.qrImageUrl}
              alt={`UPI QR for ${formatCurrencyINR(amount)}`}
              className="h-auto max-h-[65vh] w-auto max-w-full object-contain"
            />

            <p className="text-sm text-neutral-600">
              Scan with any UPI app. This screen updates by itself once the payment
              arrives.
            </p>

            <div className="flex items-center gap-2 text-xs text-neutral-500">
              {expired ? (
                <>
                  <Clock className="h-3 w-3" />
                  Timed out, but a payment made now will still be accepted.
                </>
              ) : (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for payment · expires in {mins}:{String(secs).padStart(2, '0')}
                </>
              )}
            </div>

            {message && <p className="text-xs text-amber-700">{message}</p>}

            <div className="flex items-center gap-2 pt-2">
              {/* Shrink, NOT cancel. Two very different things, so they are two
                  buttons and neither is a bare backdrop tap — at a till an
                  accidental touch must not be able to kill a live payment. */}
              <Button variant="ghost" size="sm" onClick={() => setZoomed(false)}>
                Show smaller
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void cancel()}
                disabled={cancelling}
              >
                {cancelling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Cancel payment
              </Button>
            </div>
          </div>,
          document.body,
        )}

      <p className="text-2xl font-semibold">{formatCurrencyINR(amount)}</p>
      <p className="text-sm text-muted-foreground text-center max-w-xs">
        Ask the customer to scan with any UPI app. This screen updates by itself once
        the payment arrives.
      </p>

      {message && (
        <Alert>
          <AlertDescription className="text-xs">{message}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {expired ? (
          <>
            <Clock className="h-3 w-3" />
            {/* Our window, not Razorpay's verdict — so this says "still watching",
                never "too late". A credit landing now is still honoured. */}
            The QR has timed out, but a payment made now will still be accepted.
          </>
        ) : (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Waiting for payment · expires in {mins}:{String(secs).padStart(2, '0')}
          </>
        )}
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => void cancel()}
        disabled={cancelling}
      >
        {cancelling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Cancel payment
      </Button>
    </div>
  );
}
