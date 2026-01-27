'use client';

// PaymentSelectionModal Component
// Purpose: Allow users to select multiple bills for payment
// Used in: Student billing pages

import { useState, useMemo } from 'react';
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
import { OnlinePaymentButton } from './online-payment-button';
import { OnlinePaymentAmountSelector } from './online-payment-amount-selector';
import { format } from 'date-fns';
import type { StudentBill } from '@/types/billing-schedule';
import { ArrowLeft } from 'lucide-react';

interface PaymentSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bills: StudentBill[];
  studentId: string;
}

export function PaymentSelectionModal({
  open,
  onOpenChange,
  bills,
  studentId,
}: PaymentSelectionModalProps) {
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'select' | 'amount'>('select');
  const [billAmounts, setBillAmounts] = useState<Record<string, number>>({});

  // Filter only unpaid bills
  const unpaidBills = useMemo(() => {
    return bills.filter((bill) => bill.status !== 'paid');
  }, [bills]);

  // Get selected bills objects
  const selectedBills = useMemo(() => {
    return unpaidBills.filter((bill) => selectedBillIds.has(bill.id));
  }, [unpaidBills, selectedBillIds]);

  // Calculate total amount for selected bills
  const totalAmount = useMemo(() => {
    // If custom amounts are set, use them; otherwise use full balances
    if (Object.keys(billAmounts).length > 0) {
      return Object.values(billAmounts).reduce((sum, amount) => sum + (amount || 0), 0);
    }

    return unpaidBills
      .filter((bill) => selectedBillIds.has(bill.id))
      .reduce((sum, bill) => {
        const balance = bill.balance_amount ?? bill.final_amount ?? bill.total_amount ?? 0;
        return sum + Number(balance);
      }, 0);
  }, [unpaidBills, selectedBillIds, billAmounts]);

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
    if (selectedBillIds.size === unpaidBills.length) {
      setSelectedBillIds(new Set());
    } else {
      setSelectedBillIds(new Set(unpaidBills.map((bill) => bill.id)));
    }
  };

  const handleClose = () => {
    setSelectedBillIds(new Set());
    setStep('select');
    setBillAmounts({});
    onOpenChange(false);
  };

  const handleProceedToAmount = () => {
    setStep('amount');
  };

  const handleBackToSelect = () => {
    setStep('select');
  };

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
                  ? 'Choose one or more bills to pay via HDFC SmartGateway'
                  : 'Choose to pay the full balance or enter custom amounts'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {step === 'select' ? (
          <div className="space-y-4">
            {/* Select All Checkbox */}
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all"
                  checked={selectedBillIds.size === unpaidBills.length && unpaidBills.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                <label
                  htmlFor="select-all"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Select All ({unpaidBills.length} bills)
                </label>
              </div>
              {selectedBillIds.size > 0 && (
                <div className="text-sm text-muted-foreground">
                  {selectedBillIds.size} selected
                </div>
              )}
            </div>

          {/* Bills List */}
          {unpaidBills.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No unpaid bills available
            </div>
          ) : (
            <div className="space-y-2">
              {unpaidBills.map((bill) => (
                <div
                  key={bill.id}
                  className={`flex items-center space-x-3 p-4 border rounded-lg transition-colors ${
                    selectedBillIds.has(bill.id)
                      ? 'bg-accent border-primary'
                      : 'hover:bg-accent/50'
                  }`}
                >
                  <Checkbox
                    id={`bill-${bill.id}`}
                    checked={selectedBillIds.has(bill.id)}
                    onCheckedChange={() => handleToggleBill(bill.id)}
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={`bill-${bill.id}`}
                        className="font-medium cursor-pointer"
                      >
                        {(bill as any).bill_number}
                      </label>
                      <Badge variant={getStatusBadgeVariant(bill.status)}>
                        {bill.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Due: {format(new Date(bill.due_date), 'dd MMM yyyy')}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Total: ₹{Number(bill.total_amount || 0).toLocaleString('en-IN')}
                      </span>
                      <span className="font-semibold text-primary">
                        Balance: ₹{Number((bill as any).bill_balance ?? bill.total_amount ?? 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
                disabled={selectedBillIds.size === 0 || Object.keys(billAmounts).length === 0}
                onSuccess={handleClose}
              />
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
