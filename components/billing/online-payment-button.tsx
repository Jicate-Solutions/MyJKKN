'use client';

// OnlinePaymentButton Component
// Purpose: Button to initiate online payment for student bills
// Used in: Student billing pages, bill details pages

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard, Loader2 } from 'lucide-react';
import { useOpenPaymentGateway } from '@/hooks/billing/use-payment-gateway';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CreatePaymentSessionDto } from '@/types/payment-gateway';

interface OnlinePaymentButtonProps {
  studentId: string;
  billIds: string[];
  totalAmount: number;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function OnlinePaymentButton({
  studentId,
  billIds,
  totalAmount,
  disabled = false,
  className,
  variant = 'default',
  size = 'default',
}: OnlinePaymentButtonProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { openPaymentGateway, isOpening } = useOpenPaymentGateway();

  const handlePaymentClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmPayment = async () => {
    setShowConfirmDialog(false);

    const paymentData: CreatePaymentSessionDto = {
      student_id: studentId,
      bill_ids: billIds,
    };

    await openPaymentGateway(paymentData);
  };

  const isDisabled = disabled || isOpening || billIds.length === 0 || totalAmount <= 0;

  return (
    <>
      <Button
        onClick={handlePaymentClick}
        disabled={isDisabled}
        variant={variant}
        size={size}
        className={className}
      >
        {isOpening ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Opening Payment Gateway...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            Pay Online
          </>
        )}
      </Button>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Online Payment</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>You are about to make an online payment of:</p>
                <p className="text-2xl font-bold text-foreground">
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-sm text-muted-foreground">
                  for {billIds.length} {billIds.length === 1 ? 'bill' : 'bills'}
                </p>
                <p className="text-sm">
                  You will be redirected to HDFC SmartGateway to complete the payment securely.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPayment}>
              Proceed to Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
