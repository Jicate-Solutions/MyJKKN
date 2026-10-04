'use client';

// components/ims/pos-device-payment.tsx
//
// Gateway-verified counter payment, collected on the counter's PAYMENT TERMINAL (a
// Razorpay POS DQR soundbox) instead of on the till's screen.
//
// WHAT IS DIFFERENT vs gateway-qr-payment.tsx, which it sits beside. There the QR
// lives on our screen, so taking the screen away takes the QR away. Here the QR is
// on a separate device the customer is looking at, and it STAYS PAYABLE until the
// server withdraws it — closing this tab does not stop anyone scanning it. Hence:
//
//   - The countdown is cosmetic. The deadline is enforced by the server (on each
//     poll, and by the sweep cron for a closed tab), by withdrawing the push from
//     the terminal. This screen only reports that it happened.
//
//   - 'expired' IS FINAL here, unlike the Razorpay QR. The server only marks a DQR
//     expired after the terminal accepted the withdrawal, so nothing more can be
//     paid into it. Polling stops on it.
//
//   - One payment per terminal. A second push is refused while the first is live,
//     so the screen names the payment holding the terminal and lets the cashier
//     cancel it.
//
//   - While a payment is live, onLiveChange(true) lets the modal lock the other
//     tabs: a cashier who switches to Cash while the terminal still shows a QR can
//     collect twice for one basket.
//
// WHAT IT KEEPS from gateway-qr-payment.tsx, verbatim, because these are the rules
// that make the money safe:
//
//   - IT NEVER CALLS onCreateSale. The server books the sale from the cart IT priced
//     when the payment was opened. Routing that back through the browser is the gap
//     this whole path exists to close.
//
//   - 'paid' IS NOT THE FINISH LINE. Terminal is `sale_id`.
//
//   - ONCE THE MONEY IS IN, NEVER ASK FOR IT AGAIN. No failure path after `paid`
//     offers to collect; they offer to retry BOOKING.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, CheckCircle2, AlertTriangle, RefreshCw, MonitorSmartphone, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCurrencyINR } from '@/lib/utils/ims-receipt';
import type { ImsCartItem } from '@/lib/stores/ims-cart-store';
import type { PosDevicePaymentStatus } from '@/lib/services/ims/pos-device-payment-service';

interface PushResponse {
  id: string;
  transactionRef: string;
  amount: number;
  amountPaise: number;
  deviceLabel: string;
  environment: 'demo' | 'live';
  expiresAt: string;
}

interface Blocking {
  id: string;
  amount: number;
  createdAt: string;
}

const POLL_MS = 2000;

/**
 * needs_review is still watched, just slower. The sweep keeps asking Ezetap and can
 * turn it into 'paid' — but only a poll in the cashier's session books the sale,
 * so stopping here would leave a customer who paid with no sale behind it. The
 * server rate-limits its vendor calls anyway; a faster poll would only re-read.
 */
const REVIEW_POLL_MS = 10_000;

/** See gateway-payment.tsx — how long "paid, but no sale yet" may spin. */
const BOOKING_PATIENCE_MS = 30_000;

/**
 * Statuses after which nothing more happens to THIS payment on its own. Wider than
 * the Razorpay QR's list: 'expired' is final (see the header). Not needs_review —
 * see REVIEW_POLL_MS.
 */
const FINAL_STATUSES = ['failed', 'cancelled', 'expired', 'amount_mismatch'];

/** Closed with no money in: the terminal is free and the cashier may take payment. */
const CLOSED_UNPAID = ['failed', 'cancelled', 'expired'];

/** Ezetap's lifecycle marker → what the cashier is told the terminal is doing. */
function describeStage(stage: string | null | undefined): string {
  switch (stage) {
    case 'P2P_DEVICE_RECEIVED':
      return 'Showing on the terminal — waiting for the customer';
    case 'P2P_STATUS_QUEUED':
    case 'P2P_DEVICE_SENT':
    default:
      return 'Sending to the terminal…';
  }
}

interface Props {
  storeId: string;
  items: ImsCartItem[];
  customerType: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  terminalLabel: string;
  environment: 'demo' | 'live';
  /** The SERVER booked the sale. Receives the new sale id. */
  onSaleBooked: (saleId: string) => void;
  onCancel: () => void;
  /** True while the terminal holds a payment that may still take money. */
  onLiveChange?: (live: boolean) => void;
}

type Phase = 'idle' | 'pushing' | 'waiting' | 'busy' | 'error';

export function PosDevicePayment({
  storeId,
  items,
  customerType,
  customerName,
  customerPhone,
  amount,
  terminalLabel,
  environment,
  onSaleBooked,
  onCancel,
  onLiveChange,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [push, setPush] = useState<PushResponse | null>(null);
  const [status, setStatus] = useState<PosDevicePaymentStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<Blocking | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [settled, setSettled] = useState(false);
  const [bookingStalled, setBookingStalled] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Guards a double-click (and StrictMode's double-invoke) from pushing twice. The
  // server would refuse the second push anyway, but only after the cashier had
  // been shown a "terminal busy" for a payment that is their own.
  const openingRef = useRef(false);
  const paidSinceRef = useRef<number | null>(null);

  const isDemo = (status?.environment ?? push?.environment ?? environment) === 'demo';
  const label = status?.device_label ?? push?.deviceLabel ?? terminalLabel;

  // ── Tell the modal whether the terminal may still take money ──────────────
  // Everything from the push until the sale is booked, EXCEPT a payment that closed
  // with no money in. needs_review stays live on purpose: nobody knows yet whether
  // the customer paid, so no other tab should offer to take payment.
  const live =
    phase === 'pushing' ||
    (phase === 'waiting' && !(status && CLOSED_UNPAID.includes(status.status)) &&
      status?.status !== 'amount_mismatch' && !status?.sale_id);
  useEffect(() => {
    onLiveChange?.(live);
  }, [live, onLiveChange]);
  useEffect(() => () => onLiveChange?.(false), [onLiveChange]);

  // ── Push ──────────────────────────────────────────────────────────────────
  //
  // Deliberately behind a button rather than fired on mount. Selecting a tab is a
  // cheap, easily mistaken gesture; putting an amount on a terminal a customer can
  // pay into is not. One deliberate press separates them.
  const send = useCallback(async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setPhase('pushing');
    setMessage(null);
    setBlocking(null);
    setStatus(null);
    setSettled(false);
    setBookingStalled(false);
    paidSinceRef.current = null;

    try {
      const res = await fetch('/api/ims/payment/pos-device/push', {
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

      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // The terminal is holding another payment. Not an error to retry blindly —
        // the cashier must first decide what happens to that one.
        openingRef.current = false;
        setMessage(body.error || `${terminalLabel} is busy with another payment.`);
        setBlocking((body.blocking as Blocking | null) ?? null);
        setPhase('busy');
        return;
      }
      if (!res.ok) throw new Error(body.error || 'Could not send the amount to the terminal');

      setPush(body as PushResponse);
      setPhase('waiting');
    } catch (err) {
      openingRef.current = false;
      setMessage(err instanceof Error ? err.message : 'Could not send the amount to the terminal');
      setPhase('error');
    }
  }, [storeId, items, customerType, customerName, customerPhone, terminalLabel]);

  // Back to the start, so the cashier can send again or pick another tab. Only
  // reachable once the terminal is known to be free.
  const reset = useCallback(() => {
    openingRef.current = false;
    paidSinceRef.current = null;
    setPush(null);
    setStatus(null);
    setMessage(null);
    setBlocking(null);
    setSettled(false);
    setBookingStalled(false);
    setPhase('idle');
  }, []);

  // ── Countdown ─────────────────────────────────────────────────────────────
  // Presentation only. When it reaches zero the SERVER withdraws the push on its
  // next poll; this number never decides anything.
  const expiresAt = status?.expires_at ?? push?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const ends = new Date(expiresAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.round((ends - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // ── Poll ──────────────────────────────────────────────────────────────────
  // The terminal has no webhook: this endpoint asking Ezetap is the only way the
  // payment is ever confirmed, and it also books the sale. Stop it and nothing
  // happens until the sweep cron — which can mark a row paid but cannot book it.
  useEffect(() => {
    const paymentId = push?.id;
    if (!paymentId || settled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Self-scheduling rather than setInterval, so the gap can follow the status:
    // every 2s while the customer may be paying, every 10s once parked for review.
    let delay = POLL_MS;
    const tick = async () => {
      try {
        const res = await fetch(`/api/ims/payment/pos-device/${paymentId}/status`);
        if (!res.ok) return;
        const s: PosDevicePaymentStatus = await res.json();
        if (cancelled) return;

        setStatus(s);
        delay = s.status === 'needs_review' ? REVIEW_POLL_MS : POLL_MS;

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

        if (FINAL_STATUSES.includes(s.status)) {
          setSettled(true);
        }
      } catch {
        // Transient — the next tick tries again.
      } finally {
        // A settled payment re-runs this effect, whose cleanup clears this timer.
        if (!cancelled) timer = setTimeout(() => void tick(), delay);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [push?.id, settled, onSaleBooked]);

  // ── Cancel ────────────────────────────────────────────────────────────────
  // The terminal decides. Only a cancel it accepted — or a payment already closed
  // with no money in — lets this screen go. Anything else keeps polling, because
  // the one outcome that must never be hidden is a customer who has paid.
  const withdraw = useCallback(
    async (paymentId: string): Promise<'cleared' | 'in_flight' | 'refused' | 'open'> => {
      try {
        const res = await fetch(`/api/ims/payment/pos-device/${paymentId}/cancel`, {
          method: 'POST',
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return 'refused';
        if (body?.cancelled) return 'cleared';
        if (body?.reason === 'payment_in_flight') return 'in_flight';
        if (body?.reason === 'cancel_failed' || body?.reason === 'cancel_refused') return 'refused';
        // Not 'initiated' any more: closed unpaid frees the terminal; anything else
        // (paid, needs_review) is for the poll to show.
        return CLOSED_UNPAID.includes(body?.reason) ? 'cleared' : 'open';
      } catch {
        return 'refused';
      }
    },
    [],
  );

  const cancel = useCallback(async () => {
    if (!push?.id) {
      onCancel();
      return;
    }
    setCancelling(true);
    const outcome = await withdraw(push.id);
    setCancelling(false);

    if (outcome === 'cleared') {
      onCancel();
      return;
    }
    if (outcome === 'in_flight') {
      setMessage('The customer is paying on the terminal right now — wait.');
    } else if (outcome === 'refused') {
      setMessage(
        `Could not withdraw it from ${label}. Cancel it on the terminal itself before ` +
          `taking payment another way.`,
      );
    } else {
      setMessage('This payment has moved on — checking what happened. Do not collect again.');
    }
  }, [push?.id, onCancel, withdraw, label]);

  // Clearing a payment left on the terminal by another basket (or another till).
  const clearBlocking = useCallback(async () => {
    if (!blocking) return;
    setCancelling(true);
    const outcome = await withdraw(blocking.id);
    setCancelling(false);

    if (outcome === 'cleared' || outcome === 'open') {
      // 'open' here means that payment is no longer holding the terminal (it was
      // paid or parked). Either way the terminal is free to try again.
      setBlocking(null);
      setMessage(
        outcome === 'cleared'
          ? 'That payment was cancelled. Send this one again.'
          : 'That payment is no longer waiting on the terminal. Send this one again.',
      );
    } else if (outcome === 'in_flight') {
      setMessage('The customer is paying on the terminal right now — wait.');
    } else {
      setMessage(
        `Could not withdraw that payment from ${label}. Cancel it on the terminal itself, ` +
          `then send this one again.`,
      );
    }
  }, [blocking, withdraw, label]);

  const demoBadge = isDemo ? (
    <Badge variant="outline" className="text-amber-600 border-amber-500/50">
      Demo terminal — no real money moves
    </Badge>
  ) : null;

  if (phase === 'error') {
    return (
      <div className="space-y-4 py-4">
        {demoBadge}
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Back
          </Button>
          <Button className="flex-1" onClick={() => void send()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'busy') {
    return (
      <div className="space-y-4 py-4">
        {demoBadge}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <div className="flex flex-col gap-2">
          {blocking && (
            <Button variant="outline" onClick={() => void clearBlocking()} disabled={cancelling}>
              {cancelling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Cancel that payment ({formatCurrencyINR(blocking.amount)})
            </Button>
          )}
          <Button onClick={() => void send()} disabled={cancelling}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Send {formatCurrencyINR(amount)} again
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={cancelling}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'pushing') {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        {demoBadge}
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Sending to {terminalLabel}…</p>
      </div>
    );
  }

  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        {demoBadge}
        <MonitorSmartphone className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          Put {formatCurrencyINR(amount)} on the payment terminal. The customer scans the
          QR it shows with any UPI app, and the payment is confirmed automatically.
        </p>
        <Button className="w-full" size="lg" onClick={() => void send()}>
          Send {formatCurrencyINR(amount)} to {terminalLabel}
        </Button>
        <Button variant="outline" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  }

  // ── Waiting on the terminal ───────────────────────────────────────────────
  const s = status;
  const moneyIsIn = s?.status === 'paid';
  const ref = s?.id?.slice(0, 8) ?? push?.id?.slice(0, 8);

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
        <p className="text-xs text-muted-foreground font-mono">Ref {ref}</p>
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
              Ref {ref}
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
            Payment received — booking sale…
          </p>
        )}
        {/* No "collect payment again" anywhere on this screen, on purpose. */}
      </div>
    );
  }

  if (s?.status === 'needs_review') {
    // Ezetap could not say whether money moved. Calling this a failure would invite
    // the cashier to collect a second time from a customer who may have paid.
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-600" />
        <p className="text-base font-medium text-amber-700">Could not confirm the payment</p>
        <p className="text-sm text-muted-foreground max-w-md">
          Could not confirm whether the customer paid. Do <strong>not</strong> take
          payment again until checked in Reports → Gateway payments.
        </p>
        {s.finalize_error && (
          <p className="text-xs text-muted-foreground max-w-md">{s.finalize_error}</p>
        )}
        <p className="text-xs text-muted-foreground font-mono">
          Ref {ref}
          {push?.transactionRef ? ` · ${push.transactionRef}` : ''}
        </p>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Back to the till
        </Button>
      </div>
    );
  }

  if (s?.status === 'amount_mismatch') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-600" />
        <p className="text-base font-medium">Amount does not match</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          The amount paid on the terminal does not match this bill. Nothing has been
          sold — check with the customer before retrying.
        </p>
        <p className="text-xs text-muted-foreground font-mono">Ref {ref}</p>
        <Button variant="outline" onClick={onCancel}>Close</Button>
      </div>
    );
  }

  if (s && CLOSED_UNPAID.includes(s.status)) {
    // Closed with nothing paid: the terminal is clear, so offering to send again is
    // safe here — and only here.
    const why =
      s.status === 'expired'
        ? `Timed out — withdrawn from ${label}. Nothing was paid.`
        : s.status === 'cancelled'
          ? s.finalize_error || `Cancelled. Nothing was paid.`
          : s.finalize_error || 'The payment did not go through. Nothing was paid.';
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Clock className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground max-w-md">{why}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Back
          </Button>
          <Button size="sm" onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Send again
          </Button>
        </div>
      </div>
    );
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timedOut = secondsLeft <= 0;

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {demoBadge}
      <MonitorSmartphone className="h-10 w-10 text-muted-foreground" />
      <p className="text-4xl font-semibold">{formatCurrencyINR(push?.amount ?? amount)}</p>
      <p className="text-base font-medium text-center">
        Ask the customer to scan the QR on the terminal
      </p>
      <p className="text-sm text-muted-foreground text-center">
        {describeStage(s?.terminal_stage)}
      </p>

      {message && (
        <Alert>
          <AlertDescription className="text-xs">{message}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {timedOut ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            {/* The server withdraws it and reports back; until it does, a payment
                that lands is still taken — so this says "withdrawing", not "over". */}
            Timing out — withdrawing it from {label}…
          </>
        ) : (
          <>
            <Clock className="h-3 w-3" />
            {label} · times out in {mins}:{String(secs).padStart(2, '0')}
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
