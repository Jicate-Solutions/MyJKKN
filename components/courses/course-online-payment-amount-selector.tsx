'use client';

// Adapted from components/billing/online-payment-amount-selector.tsx for
// course instalments. Same "full balance vs custom amount" pattern, with one
// addition: a custom amount below MIN_PARTIAL_COURSE_PAYMENT is rejected
// UNLESS it equals the bill's full balance — so a bill can always be paid
// off completely even when the remaining tail is small.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IndianRupee, Pencil } from 'lucide-react';
import { MIN_PARTIAL_COURSE_PAYMENT } from '@/lib/services/payments/course-payment-rules';

export interface PayableCourseBill {
  id: string;
  bill_number: string;
  installment_no: number;
  label: string | null;
  total_amount: number;
  balance_amount: number;
}

interface CourseOnlinePaymentAmountSelectorProps {
  bills: PayableCourseBill[];
  onAmountsChange: (amounts: Record<string, number>) => void;
  onValidityChange?: (valid: boolean) => void;
  defaultToFullPayment?: boolean;
}

const inr = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const billTitle = (bill: PayableCourseBill) => bill.label || `Instalment ${bill.installment_no}`;

/** Keeps the raw input to digits plus a single 2-decimal fraction. */
const sanitizeAmount = (raw: string) => {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};

const roundToPaise = (value: number) => Math.round(value * 100) / 100;

export function CourseOnlinePaymentAmountSelector({
  bills,
  onAmountsChange,
  onValidityChange,
  defaultToFullPayment = true,
}: CourseOnlinePaymentAmountSelectorProps) {
  const [paymentMode, setPaymentMode] = useState<'full' | 'custom'>(
    defaultToFullPayment ? 'full' : 'custom',
  );
  const [entryOpen, setEntryOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmedAmounts, setConfirmedAmounts] = useState<Record<string, number> | null>(null);

  const fullTotal = useMemo(
    () => bills.reduce((sum, bill) => sum + bill.balance_amount, 0),
    [bills],
  );

  const billAmounts = useMemo(() => {
    if (paymentMode === 'full') {
      return bills.reduce((acc, bill) => {
        acc[bill.id] = bill.balance_amount;
        return acc;
      }, {} as Record<string, number>);
    }
    return confirmedAmounts ?? {};
  }, [paymentMode, bills, confirmedAmounts]);

  useEffect(() => {
    onAmountsChange(billAmounts);
  }, [billAmounts, onAmountsChange]);

  const isCustomComplete = useMemo(
    () =>
      !!confirmedAmounts &&
      bills.length > 0 &&
      bills.every((bill) => {
        const amount = confirmedAmounts[bill.id];
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return false;
        if (amount > bill.balance_amount) return false;
        return amount === bill.balance_amount || amount >= MIN_PARTIAL_COURSE_PAYMENT;
      }),
    [confirmedAmounts, bills],
  );

  useEffect(() => {
    const valid =
      paymentMode === 'full' ? bills.length > 0 && fullTotal > 0 : isCustomComplete;
    onValidityChange?.(valid);
  }, [paymentMode, bills.length, fullTotal, isCustomComplete, onValidityChange]);

  const openEntry = useCallback(() => {
    setDrafts(
      bills.reduce((acc, bill) => {
        const amount = confirmedAmounts?.[bill.id];
        acc[bill.id] = typeof amount === 'number' ? String(amount) : '';
        return acc;
      }, {} as Record<string, string>),
    );
    setEntryOpen(true);
  }, [bills, confirmedAmounts]);

  const handleModeChange = (mode: string) => {
    const next = mode as 'full' | 'custom';
    setPaymentMode(next);

    if (next === 'custom') {
      setConfirmedAmounts(null);
      setDrafts(
        bills.reduce((acc, bill) => {
          acc[bill.id] = '';
          return acc;
        }, {} as Record<string, string>),
      );
      setEntryOpen(true);
    }
  };

  const handleDraftChange = (billId: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [billId]: sanitizeAmount(value) }));
  };

  const draftErrors = useMemo(() => {
    const result: Record<string, string> = {};
    bills.forEach((bill) => {
      const raw = drafts[bill.id] ?? '';
      if (raw.trim() === '') return; // untouched — the disabled action nudges instead
      const amount = parseFloat(raw);
      const balance = bill.balance_amount;
      if (!Number.isFinite(amount) || amount <= 0) {
        result[bill.id] = 'Amount must be greater than 0';
      } else if (roundToPaise(amount) > balance) {
        result[bill.id] = `Amount cannot exceed balance of ₹${inr(balance)}`;
      } else if (roundToPaise(amount) < MIN_PARTIAL_COURSE_PAYMENT && roundToPaise(amount) !== balance) {
        result[bill.id] =
          `Must be at least ₹${inr(MIN_PARTIAL_COURSE_PAYMENT)}, or pay the full ₹${inr(balance)}`;
      }
    });
    return result;
  }, [bills, drafts]);

  const draftTotal = useMemo(
    () =>
      bills.reduce((sum, bill) => {
        const amount = parseFloat(drafts[bill.id] ?? '');
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
    [bills, drafts],
  );

  const draftComplete =
    bills.length > 0 &&
    Object.keys(draftErrors).length === 0 &&
    bills.every((bill) => (drafts[bill.id] ?? '').trim() !== '');

  const handleConfirmEntry = () => {
    if (!draftComplete) return;
    const amounts = bills.reduce((acc, bill) => {
      acc[bill.id] = roundToPaise(parseFloat(drafts[bill.id]));
      return acc;
    }, {} as Record<string, number>);
    setConfirmedAmounts(amounts);
    setEntryOpen(false);
  };

  const handleCancelEntry = () => {
    setEntryOpen(false);
    if (!confirmedAmounts) setPaymentMode('full');
  };

  const totalAmount = Object.values(billAmounts).reduce((sum, amt) => sum + (amt || 0), 0);
  const awaitingAmounts = paymentMode === 'custom' && !isCustomComplete;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Label className="text-base font-semibold">Payment amount</Label>
        <RadioGroup value={paymentMode} onValueChange={handleModeChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="full" id="course-pay-full" />
            <Label htmlFor="course-pay-full" className="font-normal cursor-pointer">
              Pay full balance (₹{inr(fullTotal)})
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="custom" id="course-pay-custom" />
            <Label htmlFor="course-pay-custom" className="font-normal cursor-pointer">
              Pay a custom amount
            </Label>
          </div>
        </RadioGroup>
      </div>

      <ul className="space-y-2">
        {bills.map((bill) => {
          const entered = billAmounts[bill.id];
          return (
            <li key={bill.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{billTitle(bill)}</p>
                <p className="text-xs text-muted-foreground">
                  {bill.bill_number} · Balance ₹{inr(bill.balance_amount)}
                </p>
              </div>
              {paymentMode === 'full' ? (
                <span className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-500">
                  ₹{inr(bill.balance_amount)}
                </span>
              ) : typeof entered === 'number' ? (
                <span className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-500">
                  ₹{inr(entered)}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">Not entered</span>
              )}
            </li>
          );
        })}
      </ul>

      {paymentMode === 'custom' && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={openEntry}>
            <Pencil className="mr-2 h-4 w-4" />
            {confirmedAmounts ? 'Edit amounts' : 'Enter amounts'}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg bg-muted p-4">
        <span className="font-semibold">Total to pay:</span>
        <span className="text-xl font-bold text-primary">₹{inr(totalAmount)}</span>
      </div>

      {awaitingAmounts && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Enter the amount to pay for each instalment to continue.
          </p>
        </div>
      )}

      <Dialog
        open={entryOpen}
        onOpenChange={(open) => {
          if (!open) handleCancelEntry();
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enter amount to pay</DialogTitle>
            <DialogDescription>
              At least ₹{inr(MIN_PARTIAL_COURSE_PAYMENT)} per instalment, or the full balance to
              clear it — whichever is less.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {bills.map((bill, index) => {
              const error = draftErrors[bill.id];
              return (
                <div key={bill.id} className="space-y-2 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Label htmlFor={`course-amount-${bill.id}`} className="text-base font-medium">
                      {billTitle(bill)}
                    </Label>
                    <span className="whitespace-nowrap text-sm text-muted-foreground">
                      Balance ₹{inr(bill.balance_amount)}
                    </span>
                  </div>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id={`course-amount-${bill.id}`}
                      inputMode="decimal"
                      autoFocus={index === 0}
                      value={drafts[bill.id] ?? ''}
                      onChange={(e) => handleDraftChange(bill.id, e.target.value)}
                      placeholder="0.00"
                      className={`h-14 pl-10 text-2xl font-semibold ${
                        error ? 'border-red-500 focus-visible:ring-red-500' : ''
                      }`}
                    />
                  </div>
                  {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted p-4">
            <span className="font-semibold">Total to pay:</span>
            <span className="text-xl font-bold text-primary">₹{inr(draftTotal)}</span>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancelEntry}>
              Cancel
            </Button>
            <Button onClick={handleConfirmEntry} disabled={!draftComplete}>
              Confirm amount
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
