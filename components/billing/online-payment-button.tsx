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
import { RazorpayCheckoutLauncher } from './razorpay-checkout-launcher';
import type { CreatePaymentSessionDto } from '@/types/payment-gateway';

interface RazorpayLaunchProps {
  razorpayKeyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: 'INR';
  transactionId: string;
  customer: { name?: string; email?: string; phone?: string };
  description?: string;
}

interface OnlinePaymentButtonProps {
  studentId: string;
  billIds: string[];
  billAmounts?: Record<string, number>;  // Optional: Custom amounts per bill
  totalAmount: number;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  onSuccess?: () => void;  // Optional: Callback after successful payment initiation
}

export function OnlinePaymentButton({
  studentId,
  billIds,
  billAmounts,
  totalAmount,
  disabled = false,
  className,
  variant = 'default',
  size = 'default',
  onSuccess,
}: OnlinePaymentButtonProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [razorpayLaunchProps, setRazorpayLaunchProps] = useState<RazorpayLaunchProps | null>(null);
  const { openPaymentGateway, isOpening } = useOpenPaymentGateway();

  const handlePaymentClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmPayment = async () => {
    setShowConfirmDialog(false);

    const paymentData: CreatePaymentSessionDto = {
      student_id: studentId,
      bill_ids: billIds,
      bill_amounts: billAmounts,  // Include custom amounts if provided
    };

    const session = await openPaymentGateway(paymentData);

    // Razorpay flow: mount the launcher with the session details. Checkout
    // modal opens once checkout.js loads.
    if (session?.provider === 'razorpay' && session.razorpay_key_id && session.razorpay_order_id) {
      setRazorpayLaunchProps({
        razorpayKeyId: session.razorpay_key_id,
        razorpayOrderId: session.razorpay_order_id,
        amountPaise: session.amount_paise ?? Math.round(session.amount * 100),
        currency: 'INR',
        transactionId: session.transaction_id,
        customer: session.customer ?? {},
        description: `Bill payment for ${billIds.length} ${billIds.length === 1 ? 'bill' : 'bills'}`,
      });
    }

    // HDFC flow: window.location.href already happened inside the hook.

    // Call onSuccess callback if provided
    if (onSuccess) {
      onSuccess();
    }
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

      {razorpayLaunchProps && (
        <RazorpayCheckoutLauncher
          {...razorpayLaunchProps}
          onClose={() => setRazorpayLaunchProps(null)}
        />
      )}
    </>
  );
}
