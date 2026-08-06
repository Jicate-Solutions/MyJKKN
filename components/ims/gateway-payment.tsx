'use client';

// components/ims/gateway-payment.tsx
//
// Gateway-verified counter payment — the two halves of a redirect flow.
//
// The difference from upi-qr-payment.tsx, which sits beside it, is who decides the
// payment happened. There, the cashier types a reference number and clicks a button;
// nothing is checked. Here Razorpay confirms the credit and the amount, and these
// components only watch.
//
// WHY A REDIRECT AND NOT A QR ON OUR OWN SCREEN. The QR Codes API is not provisioned
// on this merchant account. Orders + hosted checkout is what the account actually
// has, and Razorpay's hosted page renders a UPI QR itself — so the customer still
// scans with their phone, and the counter experience survives the change.
//
// Two components because the browser leaves and comes back:
//
//   GatewayPaymentLauncher — inside the payment modal. Prices the cart server-side,
//     opens an order, and hands the browser to Razorpay.
//
//   GatewayPaymentReturn — on the POS page, when it loads with ?gp=<id>. Polls
//     until the sale exists.
//
// Three rules hold across both:
//
//   - NEITHER CALLS onCreateSale. The server books the sale from the cart IT priced
//     when the order was opened. Asking the browser to book it again would
//     reintroduce exactly the gap this removes.
//
//   - 'paid' IS NOT THE FINISH LINE. Terminal is `sale_id`. Stopping at paid would
//     tell a cashier the sale is done while it is still being booked, and if booking
//     then failed they would have no receipt and no idea why.
//
//   - ONCE THE MONEY IS IN, NEVER ASK FOR IT AGAIN. Every failure path after `paid`
//     offers "keep trying", never "collect payment".

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RazorpayHostedRedirect } from '@/components/billing/razorpay-hosted-redirect';
import type { ImsCartItem } from '@/lib/stores/ims-cart-store';

interface SessionResponse {
  id: string;
  transactionRef: string;
  amount: number;
  amountPaise: number;
  razorpayOrderId: string;
  razorpayKeyId: string;
  storeName: string;
  description: string;
  /**
   * What Razorpay's hosted page is prefilled with — resolved SERVER-SIDE, and not
   * necessarily the customer. Razorpay refuses to show a payment method without a
   * contact and an email, so a walk-in falls back to the cashier's own details;
   * see the note in gateway-payment-service.ts. The browser only forwards this.
   */
  customer: { name: string; phone: string; email: string };
  expiresAt: string;
}

export interface StatusResponse {
  id: string;
  status: string;
  amount: number;
  sale_id: string | null;
  sale_number: string | null;
  expires_at: string;
  late_credit: boolean;
  finalize_error: string | null;
  /** Booking failed for a reason retrying cannot fix — stop polling, say why. */
  finalize_fatal?: boolean;
}

const POLL_MS = 3000;

// ─────────────────────────────────────────────────────────────────────────────
// Launcher
// ─────────────────────────────────────────────────────────────────────────────

interface LauncherProps {
  storeId: string;
  items: ImsCartItem[];
  customerType: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  onCancel: () => void;
}

type LaunchPhase = 'idle' | 'opening' | 'redirecting' | 'error';

export function GatewayPaymentLauncher({
  storeId,
  items,
  customerType,
  customerName,
  customerPhone,
  amount,
  onCancel,
}: LauncherProps) {
  const [phase, setPhase] = useState<LaunchPhase>('idle');
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Guards a double-click (and React StrictMode's double-invoke) from opening two
  // orders for one cart — two live collection instruments for the same goods.
  const openingRef = useRef(false);

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
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not open the payment');

      setSession(body as SessionResponse);
      setPhase('redirecting');
    } catch (err) {
      openingRef.current = false;
      setMessage(err instanceof Error ? err.message : 'Could not open the payment');
      setPhase('error');
    }
  }, [storeId, items, customerType, customerName, customerPhone]);

  if (phase === 'redirecting' && session) {
    // Mounting this navigates the whole browser to Razorpay. The cart survives in
    // localStorage, and the server-priced snapshot survives on the payment row, so
    // leaving the page costs nothing.
    return (
      <RazorpayHostedRedirect
        razorpayKeyId={session.razorpayKeyId}
        razorpayOrderId={session.razorpayOrderId}
        amountPaise={session.amountPaise}
        currency="INR"
        transactionId={session.id}
        merchantName={session.storeName}
        description={session.description}
        customer={{
          name: session.customer.name,
          phone: session.customer.phone,
          // Sent so Razorpay skips its contact/email step and opens straight on the
          // UPI QR — the whole point of the counter flow.
          email: session.customer.email,
        }}
        callbackPath="/api/ims/payment/gateway/callback"
        // Opens on UPI so the customer sees the QR immediately — the counter flow.
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

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <ShieldCheck className="h-12 w-12 text-muted-foreground" />
      <p className="text-sm text-muted-foreground text-center">
        The customer scans and pays on the secure Razorpay page, and the payment is
        confirmed automatically — no reference number to type in.
      </p>
      <p className="text-2xl font-semibold">₹{amount.toFixed(2)}</p>
      <Button className="w-full" size="lg" onClick={() => void open()}>
        Continue to payment
      </Button>
      <Button variant="outline" className="w-full" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Return handler
// ─────────────────────────────────────────────────────────────────────────────

interface ReturnProps {
  paymentId: string;
  /** Called once the SERVER has booked the sale. Receives the new sale id. */
  onPaid: (saleId: string) => void;
  /** Cashier dismissed a finished-but-unsuccessful payment. */
  onDismiss: () => void;
  /**
   * The customer abandoned Razorpay's page rather than completing payment.
   *
   * Shows "not completed" straight away instead of spinning on a row that will
   * legitimately stay `initiated` — but KEEPS POLLING underneath. Cancelling on
   * the gateway and paying anyway is rare, not impossible, and a capture that
   * lands late still flips this to "Payment received". Telling the cashier
   * nothing happened is a display decision; refusing money is not one we make.
   */
  abandoned?: boolean;
}

/**
 * How long "paid, but no sale yet" may go on before the screen stops pretending it
 * is about to finish. Booking normally takes one poll.
 */
const BOOKING_PATIENCE_MS = 30_000;

export function GatewayPaymentReturn({ paymentId, onPaid, onDismiss, abandoned }: ReturnProps) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [settled, setSettled] = useState(false);
  const [bookingStalled, setBookingStalled] = useState(false);

  // When the money first landed. Used only to decide when to stop showing a
  // spinner — polling itself never gives up.
  const paidSinceRef = useRef<number | null>(null);

  // Poll. This is not merely reading our own table — the endpoint asks Razorpay
  // directly AND books the sale, so it is what completes the payment when no
  // webhook can arrive (always the case on localhost, and after any webhook
  // outage in production).
  useEffect(() => {
    if (!paymentId || settled) return;

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
          onPaid(s.sale_id);
          return;
        }

        // 'paid' is NOT terminal — keep polling while the sale is booked. But stop
        // *claiming* it is nearly done after a while: a cashier watching a spinner
        // that never resolves has no way to tell a slow booking from a stuck one,
        // and may sell the goods again or take payment twice.
        if (s.status === 'paid') {
          paidSinceRef.current ??= Date.now();

          // Except when the server has already established that retrying is
          // pointless — a store with no counter, an item not sold here, no stock.
          // Polling on regardless is what produced a booking refused identically
          // once a second for as long as the cashier was willing to watch.
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
  }, [paymentId, settled, onPaid]);

  const s = status;
  const moneyIsIn = s?.status === 'paid';

  let body: ReactNode;

  if (moneyIsIn && s?.finalize_fatal) {
    // Money in, sale refused, and retrying will not change that. Unlike the
    // stalled case below there is no spinner and no "still trying" — the reason is
    // shown, because it names something a person has to go and fix.
    body = (
      <>
        <AlertTriangle className="h-10 w-10 text-amber-600" />
        <p className="text-base font-medium text-green-600">Payment received</p>
        <p className="text-sm font-medium">The sale could not be completed.</p>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {s?.finalize_error || 'The sale was refused.'}
        </p>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          The customer has paid and the money is safe — do <strong>not</strong> take
          payment again. Fix the cause above, then use Try again; the sale will be
          booked without a second payment.
        </p>
        <p className="text-xs text-muted-foreground font-mono">Ref {s?.id?.slice(0, 8)}</p>
        <div className="flex items-center gap-2">
          {/* Resumes polling. The server never persisted the fatal verdict, so the
              very next attempt succeeds once the cause is gone. */}
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
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Back to the till
          </Button>
        </div>
      </>
    );
  } else if (moneyIsIn && bookingStalled) {
    // The money is in and the sale is not. Say exactly that. Polling continues
    // underneath, so this can still resolve itself into a receipt.
    body = (
      <>
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <p className="text-base font-medium text-green-600">Payment received</p>
        <p className="text-sm font-medium">The sale has not been completed yet.</p>
        <p className="text-sm text-muted-foreground text-center max-w-md">
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
        {/* Deliberately no "collect payment again" anywhere on this screen. */}
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Back to the till
        </Button>
      </>
    );
  } else if (moneyIsIn) {
    body = (
      <>
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <p className="text-base font-medium text-green-600">Payment received</p>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          {s?.finalize_error
            ? 'Completing the sale is taking longer than usual — staying on it.'
            : 'Completing the sale…'}
        </p>
        {/* No retry-payment button here on purpose: the money is ours. Offering to
            collect again is how a customer gets charged twice. */}
      </>
    );
  } else if (s?.status === 'amount_mismatch') {
    body = (
      <>
        <AlertTriangle className="h-10 w-10 text-amber-600" />
        <p className="text-base font-medium">Amount does not match</p>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          The amount paid does not match this bill. Nothing has been sold — check with
          the customer before retrying.
        </p>
        <Button variant="outline" onClick={onDismiss}>Close</Button>
      </>
    );
  } else if (
    (s && ['failed', 'cancelled'].includes(s.status)) ||
    (abandoned && s && ['initiated', 'expired'].includes(s.status))
  ) {
    body = (
      <>
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-base font-medium">Payment not completed</p>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          The cart is still here. Try again, or take payment another way.
        </p>
        <Button variant="outline" onClick={onDismiss}>Back to the till</Button>
      </>
    );
  } else {
    body = (
      <>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Confirming the payment…</p>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/90 backdrop-blur-sm px-4">
      {body}
    </div>
  );
}
