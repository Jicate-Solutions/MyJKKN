'use client';

// PaymentSelectionModal Component
// Purpose: Allow users to select multiple bills for payment
// Used in: Student billing pages

import { useState, useMemo, useEffect, useCallback } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { OnlinePaymentButton, type RazorpayLaunchProps } from './online-payment-button';
import { RazorpayHostedRedirect } from './razorpay-hosted-redirect';
import { OnlinePaymentAmountSelector } from './online-payment-amount-selector';
import { useConnectedFeeHeads } from '@/hooks/billing/use-connected-fee-heads';
import { format } from 'date-fns';
import type { StudentBill } from '@/types/billing-schedule';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface PaymentSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bills: StudentBill[];
  studentId: string;
  /** Bills to pre-tick each time the modal opens (e.g. a per-bill Pay button). */
  initialSelectedBillIds?: string[];
}

export function PaymentSelectionModal({
  open,
  onOpenChange,
  bills,
  studentId,
  initialSelectedBillIds,
}: PaymentSelectionModalProps) {
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());

  // Re-apply the initial selection on every open (close resets it to empty).
  useEffect(() => {
    if (open && initialSelectedBillIds?.length) {
      setSelectedBillIds(new Set(initialSelectedBillIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const [step, setStep] = useState<'select' | 'amount'>('select');
  const [billAmounts, setBillAmounts] = useState<Record<string, number>>({});
  // Reported by the amount selector. A partial payment stays invalid until the
  // operator enters an amount for every bill, so "Pay Online" cannot fire with
  // a blank or over-balance amount.
  const [amountsValid, setAmountsValid] = useState(false);
  // The Razorpay hosted-redirect component lives OUTSIDE the <Dialog> so closing
  // the dialog (handleClose) doesn't unmount it before it POSTs the form to
  // Razorpay's hosted page.
  const [razorpayLaunch, setRazorpayLaunch] = useState<RazorpayLaunchProps | null>(null);

  // Filter only unpaid bills
  const unpaidBills = useMemo(() => {
    return bills.filter((bill) => bill.status !== 'paid');
  }, [bills]);

  // Online payment is only possible for bills whose fee head (category kind)
  // has a connected Razorpay account at this institution. Unconnected heads
  // (e.g. hostel without an account) are hidden here and settled manually.
  const institutionId = bills[0]?.institution_id ?? null;
  const {
    data: connectivity,
    isLoading: connectivityLoading,
    isError: connectivityError,
  } = useConnectedFeeHeads(open ? institutionId : null);

  const payableBills = useMemo(() => {
    if (!connectivity) return []; // unknown yet → fail closed, nothing payable
    if (connectivity.allConnected) return unpaidBills;
    return unpaidBills.filter((bill) => {
      const kind = bill.item_category?.kind;
      return !!kind && connectivity.feeHeads.includes(kind);
    });
  }, [unpaidBills, connectivity]);

  const officeOnlyCount = unpaidBills.length - payableBills.length;

  // One fee head per payment: a mixed-head order routes to the institution's
  // DEFAULT account, which only exists when allConnected. Otherwise lock the
  // selection to the first selected bill's head.
  const enforceSingleHead = !!connectivity && !connectivity.allConnected;
  const selectedKind = useMemo(() => {
    if (!enforceSingleHead || selectedBillIds.size === 0) return null;
    const first = payableBills.find((bill) => selectedBillIds.has(bill.id));
    return first?.item_category?.kind ?? null;
  }, [enforceSingleHead, payableBills, selectedBillIds]);

  const isBillSelectable = (bill: StudentBill) =>
    !selectedKind || bill.item_category?.kind === selectedKind;

  // Distinct heads among payable bills — Select All only makes sense when they
  // all share one head (or mixing is allowed).
  const payableKinds = useMemo(
    () => [...new Set(payableBills.map((b) => b.item_category?.kind ?? null))],
    [payableBills],
  );
  const selectAllAvailable = !enforceSingleHead || payableKinds.length <= 1;

  // Get selected bills objects
  const selectedBills = useMemo(() => {
    return payableBills.filter((bill) => selectedBillIds.has(bill.id));
  }, [payableBills, selectedBillIds]);

  // Calculate total amount for selected bills
  const totalAmount = useMemo(() => {
    // If custom amounts are set, use them; otherwise use full balances
    if (Object.keys(billAmounts).length > 0) {
      return Object.values(billAmounts).reduce((sum, amount) => sum + (amount || 0), 0);
    }

    return payableBills
      .filter((bill) => selectedBillIds.has(bill.id))
      .reduce((sum, bill) => {
        const balance = bill.balance_amount ?? bill.final_amount ?? bill.total_amount ?? 0;
        return sum + Number(balance);
      }, 0);
  }, [payableBills, selectedBillIds, billAmounts]);

  const handleToggleBill = (billId: string) => {
    const newSelected = new Set(selectedBillIds);
    if (newSelected.has(billId)) {
      newSelected.delete(billId);
    } else {
      newSelected.add(billId);
    }
    setSelectedBillIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedBillIds.size === payableBills.length) {
      setSelectedBillIds(new Set());
    } else {
      setSelectedBillIds(new Set(payableBills.map((bill) => bill.id)));
    }
  };

  const handleClose = () => {
    setSelectedBillIds(new Set());
    setStep('select');
    setBillAmounts({});
    setAmountsValid(false);
    onOpenChange(false);
  };

  const handleProceedToAmount = () => {
    setStep('amount');
  };

  const handleBackToSelect = () => {
    setStep('select');
    // Drop the amounts of the selection being left behind; the selector
    // re-reports them when the user comes forward again.
    setBillAmounts({});
    setAmountsValid(false);
  };

  // Stable identity — the selector reports validity from an effect.
  const handleValidityChange = useCallback((valid: boolean) => {
    setAmountsValid(valid);
  }, []);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'pending':
        return 'destructive';
      case 'partial':
        return 'default';
      case 'overdue':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step === 'amount' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToSelect}
                className="h-8 w-8 p-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1">
              <DialogTitle>
                {step === 'select' ? 'Select Bills to Pay Online' : 'Configure Payment Amount'}
              </DialogTitle>
              <DialogDescription>
                {step === 'select'
                  ? 'Choose one or more bills to pay via Razorpay'
                  : 'Choose to pay the full balance or enter custom amounts'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {step === 'select' ? (
          <div className="space-y-4">
            {/* Select All Checkbox */}
            {selectAllAvailable && payableBills.length > 0 && (
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedBillIds.size === payableBills.length && payableBills.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <label
                    htmlFor="select-all"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Select All ({payableBills.length} bills)
                  </label>
                </div>
                {selectedBillIds.size > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {selectedBillIds.size} selected
                  </div>
                )}
              </div>
            )}

          {/* Bills List */}
          {connectivityLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking online payment availability…
            </div>
          ) : connectivityError ? (
            <div className="text-center py-8 text-muted-foreground">
              Couldn&apos;t check online payment availability. Please close and try again.
            </div>
          ) : payableBills.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {unpaidBills.length === 0
                ? 'No unpaid bills available'
                : 'These bills can’t be paid online yet — please pay at the accounts office.'}
            </div>
          ) : (
            <div className="space-y-2">
              {payableBills.map((bill) => (
                <div
                  key={bill.id}
                  className={`flex items-center space-x-3 p-4 border rounded-lg transition-colors ${
                    selectedBillIds.has(bill.id)
                      ? 'bg-accent border-primary'
                      : isBillSelectable(bill)
                        ? 'hover:bg-accent/50'
                        : 'opacity-50'
                  }`}
                >
                  <Checkbox
                    id={`bill-${bill.id}`}
                    checked={selectedBillIds.has(bill.id)}
                    disabled={!selectedBillIds.has(bill.id) && !isBillSelectable(bill)}
                    onCheckedChange={() => handleToggleBill(bill.id)}
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`bill-${bill.id}`}
                        className="font-medium cursor-pointer"
                      >
                        {bill.item_category?.category_name ??
                          bill.bill_description ??
                          'Bill'}
                      </label>
                      <Badge variant={getStatusBadgeVariant(bill.status)}>
                        {bill.status.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                    </div>
                    {/* Secondary identifiers so the user can tell bills apart:
                        the description (when it differs from the category) and
                        the academic year, alongside the due date. */}
                    {bill.bill_description &&
                      bill.bill_description !== bill.item_category?.category_name && (
                        <div className="text-sm text-foreground/80">
                          {bill.bill_description}
                        </div>
                      )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                      {bill.academic_year?.academic_year_name && (
                        <span>AY: {bill.academic_year.academic_year_name}</span>
                      )}
                      {bill.due_date && (
                        <span>Due: {format(new Date(bill.due_date), 'dd MMM yyyy')}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Total: ₹{Number(bill.total_amount || 0).toLocaleString('en-IN')}
                      </span>
                      <span className="font-semibold text-primary">
                        {/* balance_amount is the live outstanding (trigger-maintained);
                            total_amount only backstops rows that predate it. */}
                        Balance: ₹{Number(bill.balance_amount ?? bill.total_amount ?? 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

            {/* Availability / selection-rule notes */}
            {!connectivityLoading && !connectivityError && officeOnlyCount > 0 && payableBills.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {officeOnlyCount} bill{officeOnlyCount !== 1 ? 's' : ''} can&apos;t be paid online yet
                and {officeOnlyCount !== 1 ? 'are' : 'is'} not shown here — please pay at the accounts office.
              </p>
            )}
            {enforceSingleHead && !selectAllAvailable && (
              <p className="text-xs text-muted-foreground">
                Bills of different fee types are paid in separate transactions — selecting a bill
                disables bills of other fee types.
              </p>
            )}

            {/* Payment Summary */}
            {selectedBillIds.size > 0 && (
              <div className="border-t pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Selected Bills:</span>
                  <span className="font-medium">{selectedBillIds.size}</span>
                </div>
                <div className="flex items-center justify-between text-lg font-bold">
                  <span>Total Amount:</span>
                  <span className="text-primary">
                    ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <OnlinePaymentAmountSelector
              bills={selectedBills}
              onAmountsChange={setBillAmounts}
              onValidityChange={handleValidityChange}
              defaultToFullPayment={true}
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'select' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleProceedToAmount}
                disabled={selectedBillIds.size === 0}
              >
                Next: Configure Amount
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleBackToSelect}>
                Back
              </Button>
              <OnlinePaymentButton
                studentId={studentId}
                billIds={Array.from(selectedBillIds)}
                billAmounts={billAmounts}
                totalAmount={totalAmount}
                disabled={selectedBillIds.size === 0 || !amountsValid}
                onSuccess={handleClose}
                onRazorpaySession={(p) => {
                  // Mount the redirect component (sibling of this Dialog) FIRST,
                  // then close the dialog. It survives the close and POSTs the
                  // form that navigates the browser to Razorpay's hosted page.
                  setRazorpayLaunch(p);
                  handleClose();
                }}
              />
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {razorpayLaunch && (
      <RazorpayHostedRedirect
        {...razorpayLaunch}
        onClose={() => setRazorpayLaunch(null)}
      />
    )}
    </>
  );
}
