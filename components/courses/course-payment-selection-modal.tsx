'use client';

// Adapted from components/billing/payment-selection-modal.tsx for course
// instalments. Two differences from the billing version:
//   - No fee-head "connected accounts" pre-check: a course enrolment already
//     resolves to exactly one institution, and /api/courses/payments/initiate
//     surfaces a plain 503 if that institution has no Razorpay account.
//   - Checkout happens IN-PAGE (Razorpay Checkout modal), not via a hosted
//     redirect — courses never adopted the HDFC hosted-redirect flow billing
//     uses, so this stays consistent with the single-bill flow it replaces.
//
// One order can cover several selected bills (see initiate/route.ts) — the
// same modal serves both a single per-bill "Pay" tap (via
// initialSelectedBillIds) and an enrolment-level "Pay instalments" action
// that starts with nothing pre-selected.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CreditCard, Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CourseOnlinePaymentAmountSelector,
  type PayableCourseBill,
} from './course-online-payment-amount-selector';

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

const inr = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 2 });

interface CoursePaymentSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bills: PayableCourseBill[];
  /** Bills to pre-tick each time the modal opens (e.g. a per-bill Pay button). */
  initialSelectedBillIds?: string[];
}

export function CoursePaymentSelectionModal({
  open,
  onOpenChange,
  bills,
  initialSelectedBillIds,
}: CoursePaymentSelectionModalProps) {
  const router = useRouter();
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'select' | 'amount'>('select');
  const [billAmounts, setBillAmounts] = useState<Record<string, number>>({});
  const [amountsValid, setAmountsValid] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-apply the initial selection on every open (close resets it to empty).
  useEffect(() => {
    if (open) {
      setSelectedBillIds(new Set(initialSelectedBillIds ?? []));
      setStep('select');
      setBillAmounts({});
      setAmountsValid(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedBills = useMemo(
    () => bills.filter((b) => selectedBillIds.has(b.id)),
    [bills, selectedBillIds],
  );

  const handleToggleBill = (billId: string) => {
    setSelectedBillIds((prev) => {
      const next = new Set(prev);
      if (next.has(billId)) next.delete(billId);
      else next.add(billId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedBillIds(selectedBillIds.size === bills.length ? new Set() : new Set(bills.map((b) => b.id)));
  };

  const handleClose = () => {
    if (busy) return;
    onOpenChange(false);
  };

  const handleBackToSelect = () => {
    setStep('select');
    setBillAmounts({});
    setAmountsValid(false);
  };

  const totalAmount = Object.values(billAmounts).reduce((sum, amt) => sum + (amt || 0), 0);

  const handlePay = async () => {
    if (busy || selectedBills.length === 0 || !amountsValid) return;
    setBusy(true);

    try {
      const res = await fetch('/api/courses/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: selectedBills.map((b) => ({ billId: b.id, amount: billAmounts[b.id] })),
        }),
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
        notes: { bill_numbers: (order.billNumbers ?? []).join(', ') },
        theme: { color: '#18181b' },

        handler: async (response: Record<string, string>) => {
          // Razorpay has taken the money. Whether the BILLS are credited is
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
                result.alreadyRecorded ? 'This payment is already recorded.' : 'Payment received.',
              );
              // replace(), not push(): the Razorpay modal is not a history
              // entry a Back press should return to.
              router.replace(
                `/my-courses?paid=${encodeURIComponent((order.billNumbers ?? []).join(', '))}`,
              );
            }
          } catch {
            toast.error(
              'Your payment went through but we could not confirm it here. Contact the institution before paying again.',
            );
          } finally {
            setBusy(false);
            onOpenChange(false);
            // The server component re-reads the balances, so the screen
            // reflects whatever actually landed.
            router.refresh();
          }
        },

        modal: {
          // Dismissing is not a failure and must not leave the button spinning.
          ondismiss: () => setBusy(false),
        },
      });

      // Razorpay Checkout mounts `.razorpay-container` as a direct child of
      // <body>, OUTSIDE this Dialog's portal. While a modal Radix layer is
      // mounted, @radix-ui/react-dismissable-layer holds
      // document.body.style.pointerEvents = 'none' and only DialogContent sets
      // pointer-events: auto back on itself — so checkout renders in full but
      // every tap inside it is swallowed, and the focus trap blocks typing a
      // card number too. The payment options look dead. The dialog must
      // therefore be GONE before checkout opens, not merely behind it.
      //
      // Same rule the billing flow already follows (payment-selection-modal.tsx
      // mounts its redirect first, then closes; online-payment-button.tsx closes
      // as its first statement). onOpenChange directly rather than
      // handleClose(), which no-ops while `busy` is true.
      onOpenChange(false);

      // DialogContent exits through a 200ms animation (duration-200 in
      // components/ui/dialog.tsx) and the dismissable layer stays mounted for
      // all of it, so opening in the same tick would still land on an inert
      // body. Wait past the animation, then clear the lock outright so the fix
      // does not silently depend on that duration staying 200ms.
      window.setTimeout(() => {
        document.body.style.pointerEvents = '';
        try {
          checkout.open();
        } catch {
          toast.error('Could not start the payment.');
          setBusy(false);
        }
      }, 250);
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
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step === 'amount' && (
              <Button variant="ghost" size="sm" onClick={handleBackToSelect} className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1">
              <DialogTitle>
                {step === 'select' ? 'Select instalments to pay' : 'Choose amount to pay'}
              </DialogTitle>
              <DialogDescription>
                {step === 'select'
                  ? 'Pick one or more unpaid instalments to pay online.'
                  : 'Pay the full balance, or a partial amount now and the rest later.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {step === 'select' ? (
          <div className="space-y-3">
            {bills.length > 1 && (
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="course-select-all"
                    checked={selectedBillIds.size === bills.length && bills.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <label htmlFor="course-select-all" className="text-sm font-medium">
                    Select all ({bills.length})
                  </label>
                </div>
                {selectedBillIds.size > 0 && (
                  <span className="text-sm text-muted-foreground">{selectedBillIds.size} selected</span>
                )}
              </div>
            )}

            <div className="space-y-2">
              {bills.map((bill) => (
                <div
                  key={bill.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selectedBillIds.has(bill.id) ? 'border-primary bg-accent' : 'hover:bg-accent/50'
                  }`}
                >
                  <Checkbox
                    id={`course-bill-${bill.id}`}
                    checked={selectedBillIds.has(bill.id)}
                    onCheckedChange={() => handleToggleBill(bill.id)}
                  />
                  <label htmlFor={`course-bill-${bill.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                    <p className="truncate font-medium">
                      {bill.label || `Instalment ${bill.installment_no}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bill.bill_number} · Balance ₹{inr(bill.balance_amount)}
                    </p>
                  </label>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <CourseOnlinePaymentAmountSelector
            bills={selectedBills}
            onAmountsChange={setBillAmounts}
            onValidityChange={setAmountsValid}
            defaultToFullPayment
          />
        )}

        <DialogFooter className="gap-2">
          {step === 'select' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep('amount')} disabled={selectedBillIds.size === 0}>
                Next
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleBackToSelect} disabled={busy}>
                Back
              </Button>
              <Button onClick={handlePay} disabled={busy || !amountsValid || totalAmount <= 0}>
                {busy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                )}
                Pay ₹{inr(totalAmount)}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
