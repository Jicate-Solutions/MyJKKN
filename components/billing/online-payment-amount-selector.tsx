'use client';

import { useState, useEffect } from 'react';
import { StudentBill } from '@/types/billing-schedule';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IndianRupee } from 'lucide-react';

interface OnlinePaymentAmountSelectorProps {
  bills: StudentBill[];
  onAmountsChange: (amounts: Record<string, number>) => void;
  defaultToFullPayment?: boolean;
}

export function OnlinePaymentAmountSelector({
  bills,
  onAmountsChange,
  defaultToFullPayment = true,
}: OnlinePaymentAmountSelectorProps) {
  const [paymentMode, setPaymentMode] = useState<'full' | 'custom'>(
    defaultToFullPayment ? 'full' : 'custom'
  );
  const [billAmounts, setBillAmounts] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize amounts when bills change or mode switches to full
  useEffect(() => {
    if (paymentMode === 'full') {
      const fullAmounts = bills.reduce((acc, bill) => {
        acc[bill.id] = bill.balance_amount ?? 0;
        return acc;
      }, {} as Record<string, number>);
      setBillAmounts(fullAmounts);
      setErrors({});
      onAmountsChange(fullAmounts);
    }
  }, [paymentMode, bills, onAmountsChange]);

  const handleModeChange = (mode: string) => {
    setPaymentMode(mode as 'full' | 'custom');
    if (mode === 'custom') {
      // Initialize with full amounts when switching to custom mode
      const fullAmounts = bills.reduce((acc, bill) => {
        acc[bill.id] = bill.balance_amount ?? 0;
        return acc;
      }, {} as Record<string, number>);
      setBillAmounts(fullAmounts);
      onAmountsChange(fullAmounts);
    }
  };

  const handleAmountChange = (billId: string, value: string) => {
    const amount = parseFloat(value) || 0;
    const bill = bills.find((b) => b.id === billId);

    if (!bill) return;

    const balance = bill.balance_amount ?? 0;
    const newErrors = { ...errors };

    // Validate amount
    if (amount <= 0) {
      newErrors[billId] = 'Amount must be greater than 0';
    } else if (amount > balance) {
      newErrors[billId] = `Amount cannot exceed balance of ₹${balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    } else {
      delete newErrors[billId];
    }

    setErrors(newErrors);

    const newAmounts = { ...billAmounts, [billId]: amount };
    setBillAmounts(newAmounts);
    onAmountsChange(newAmounts);
  };

  const totalAmount = Object.values(billAmounts).reduce(
    (sum, amt) => sum + (amt || 0),
    0
  );

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="space-y-4">
      {/* Payment mode toggle */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Payment Mode</Label>
        <RadioGroup value={paymentMode} onValueChange={handleModeChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="full" id="full" />
            <Label htmlFor="full" className="font-normal cursor-pointer">
              Pay Full Amount (₹{bills.reduce((sum, bill) => sum + (bill.balance_amount ?? 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })})
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
              const balance = bill.balance_amount ?? 0;
              const hasError = !!errors[bill.id];

              return (
                <TableRow key={bill.id}>
                  <TableCell className="font-medium">
                    {bill.bill_description || 'No description'}
                  </TableCell>
                  <TableCell className="text-right">
                    ₹{(bill.final_amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right">
                    ₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right">
                    {paymentMode === 'full' ? (
                      <span className="font-semibold text-green-600">
                        ₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        <div className="relative w-32">
                          <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={balance}
                            value={billAmounts[bill.id] || ''}
                            onChange={(e) => handleAmountChange(bill.id, e.target.value)}
                            className={`pl-8 text-right ${hasError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            placeholder="0.00"
                          />
                        </div>
                        {hasError && (
                          <span className="text-xs text-red-500">
                            {errors[bill.id]}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Total display */}
      <div className="flex justify-end items-center space-x-4 p-4 bg-muted rounded-lg">
        <span className="text-lg font-semibold">Total Amount to Pay:</span>
        <span className={`text-2xl font-bold ${hasErrors ? 'text-red-500' : 'text-primary'}`}>
          ₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </span>
      </div>

      {hasErrors && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600 font-medium">
            Please correct the errors before proceeding with payment.
          </p>
        </div>
      )}
    </div>
  );
}
