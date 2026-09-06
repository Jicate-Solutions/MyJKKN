'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StudentBill } from '@/types/billing-schedule';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IndianRupee, Pencil } from 'lucide-react';

interface OnlinePaymentAmountSelectorProps {
  bills: StudentBill[];
  onAmountsChange: (amounts: Record<string, number>) => void;
  /**
   * Reports whether the current amounts are payable. The parent gates the
   * "Pay Online" button on this — an invalid or not-yet-entered partial amount
   * must never reach the gateway.
   */
  onValidityChange?: (valid: boolean) => void;
  defaultToFullPayment?: boolean;
}

const inr = (value: number) =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const balanceOf = (bill: StudentBill) => bill.balance_amount ?? 0;

/** Keeps the raw input to digits plus a single 2-decimal fraction. */
const sanitizeAmount = (raw: string) => {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};

const roundToPaise = (value: number) => Math.round(value * 100) / 100;

export function OnlinePaymentAmountSelector({
  bills,
  onAmountsChange,
  onValidityChange,
  defaultToFullPayment = true,
}: OnlinePaymentAmountSelectorProps) {
  const [paymentMode, setPaymentMode] = useState<'full' | 'custom'>(
    defaultToFullPayment ? 'full' : 'custom'
  );
  // Partial amounts are typed in a dedicated dialog rather than in the cramped
  // table cell, where the field scrolled out of view and the full-balance
  // prefill let operators confirm a "partial" payment that was silently full.
  const [entryOpen, setEntryOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Partial amounts as confirmed in the entry dialog. Only ever written from a
  // user action, never from an effect.
  const [confirmedAmounts, setConfirmedAmounts] = useState<Record<string, number> | null>(
    null
  );

  const fullTotal = useMemo(
    () => bills.reduce((sum, bill) => sum + balanceOf(bill), 0),
    [bills]
  );

  // What the parent pays. Full mode is a pure derivation of the bills, so it
  // needs no state of its own; partial mode is empty until amounts are confirmed.
  const billAmounts = useMemo(() => {
    if (paymentMode === 'full') {
      return bills.reduce((acc, bill) => {
        acc[bill.id] = balanceOf(bill);
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
        return (
          typeof amount === 'number' &&
          Number.isFinite(amount) &&
          amount > 0 &&
          amount <= balanceOf(bill)
        );
      }),
    [confirmedAmounts, bills]
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
      }, {} as Record<string, string>)
    );
    setEntryOpen(true);
  }, [bills, confirmedAmounts]);

  const handleModeChange = (mode: string) => {
    const next = mode as 'full' | 'custom';
    setPaymentMode(next);

    if (next === 'custom') {
      // Start empty — nothing is payable until the operator types an amount.
      setConfirmedAmounts(null);
      setDrafts(
        bills.reduce((acc, bill) => {
          acc[bill.id] = '';
          return acc;
        }, {} as Record<string, string>)
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
      const balance = balanceOf(bill);
      if (!Number.isFinite(amount) || amount <= 0) {
        result[bill.id] = 'Amount must be greater than 0';
      } else if (roundToPaise(amount) > balance) {
        result[bill.id] = `Amount cannot exceed balance of ₹${inr(balance)}`;
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
    [bills, drafts]
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
    // Never strand the user in partial mode with nothing entered — fall back to
    // full payment, which is always valid.
    if (!confirmedAmounts) setPaymentMode('full');
  };

  const totalAmount = Object.values(billAmounts).reduce(
    (sum, amt) => sum + (amt || 0),
    0
  );

  const awaitingAmounts = paymentMode === 'custom' && !isCustomComplete;

  return (
    <div className="space-y-4">
      {/* Payment mode toggle */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Payment Mode</Label>
        <RadioGroup value={paymentMode} onValueChange={handleModeChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="full" id="full" />
            <Label htmlFor="full" className="font-normal cursor-pointer">
              Pay Full Amount (₹{inr(fullTotal)})
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="custom" id="custom" />
            <Label htmlFor="custom" className="font-normal cursor-pointer">
              Pay Partial Amount
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Bills table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill Description</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Amount to Pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.map((bill) => {
              const balance = balanceOf(bill);
              const entered = billAmounts[bill.id];

              return (
                <TableRow key={bill.id}>
                  <TableCell className="font-medium">
                    {bill.bill_description || 'No description'}
                  </TableCell>
                  <TableCell className="text-right">
                    ₹{inr(bill.final_amount ?? 0)}
                  </TableCell>
                  <TableCell className="text-right">₹{inr(balance)}</TableCell>
                  <TableCell className="text-right">
                    {paymentMode === 'full' ? (
                      <span className="font-semibold text-green-600">
                        ₹{inr(balance)}
                      </span>
                    ) : typeof entered === 'number' ? (
                      <span className="font-semibold text-green-600">
                        ₹{inr(entered)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Not entered
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {paymentMode === 'custom' && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={openEntry}>
            <Pencil className="mr-2 h-4 w-4" />
            {confirmedAmounts ? 'Edit amounts' : 'Enter amounts'}
          </Button>
        </div>
      )}

      {/* Total display */}
      <div className="flex justify-end items-center space-x-4 p-4 bg-muted rounded-lg">
        <span className="text-lg font-semibold">Total Amount to Pay:</span>
        <span className="text-2xl font-bold text-primary">₹{inr(totalAmount)}</span>
      </div>

      {awaitingAmounts && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md dark:bg-amber-950/30 dark:border-amber-900">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Enter the amount to pay for each bill to continue.
          </p>
        </div>
      )}

      {/* Focused amount-entry dialog — the partial amount is typed here, not in
          the table cell, so it is always in view. */}
      <Dialog
        open={entryOpen}
        onOpenChange={(open) => {
          if (!open) handleCancelEntry();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enter Amount to Pay</DialogTitle>
            <DialogDescription>
              Type how much to pay for each bill. It cannot be more than the
              bill&apos;s balance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {bills.map((bill, index) => {
              const balance = balanceOf(bill);
              const error = draftErrors[bill.id];

              return (
                <div key={bill.id} className="space-y-2 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Label
                      htmlFor={`amount-${bill.id}`}
                      className="text-base font-medium"
                    >
                      {bill.bill_description || 'No description'}
                    </Label>
                    <span className="whitespace-nowrap text-sm text-muted-foreground">
                      Balance ₹{inr(balance)}
                    </span>
                  </div>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id={`amount-${bill.id}`}
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
            <span className="font-semibold">Total Amount to Pay:</span>
            <span className="text-2xl font-bold text-primary">
              ₹{inr(draftTotal)}
            </span>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancelEntry}>
              Cancel
            </Button>
            <Button onClick={handleConfirmEntry} disabled={!draftComplete}>
              Confirm Amounts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
