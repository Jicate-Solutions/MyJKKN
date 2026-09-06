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
import { RazorpayHostedRedirect } from './razorpay-hosted-redirect';
import type { CreatePaymentSessionDto } from '@/types/payment-gateway';

export interface RazorpayLaunchProps {
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
  // When provided, a Razorpay session is handed to the parent to launch the
  // checkout OUTSIDE this (closable) subtree. Required when this button lives
  // inside a dialog that closes on success — otherwise the redirect component
  // unmounts before it can POST the form to Razorpay's hosted page.
  onRazorpaySession?: (props: RazorpayLaunchProps) => void;
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
  onRazorpaySession,
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

    // Razorpay flow: hand the launch details up (or mount locally if standalone).
    if (session?.provider === 'razorpay' && session.razorpay_key_id && session.razorpay_order_id) {
      const launch: RazorpayLaunchProps = {
        razorpayKeyId: session.razorpay_key_id,
        razorpayOrderId: session.razorpay_order_id,
        amountPaise: session.amount_paise ?? Math.round(session.amount * 100),
        currency: 'INR',
        transactionId: session.transaction_id,
        customer: session.customer ?? {},
        description: `Bill payment for ${billIds.length} ${billIds.length === 1 ? 'bill' : 'bills'}`,
      };

      if (onRazorpaySession) {
        // Parent owns the launcher (renders it above any closable dialog) and
        // decides when to close. It calls onSuccess/handleClose itself.
        onRazorpaySession(launch);
      } else {
        setRazorpayLaunchProps(launch);
      }

      // IMPORTANT: do NOT call onSuccess() on the Razorpay path. When this button
      // is inside a dialog, onSuccess closes it — which would unmount the redirect
      // component before it can POST the form to Razorpay. The hosted flow fully
      // navigates the browser to Razorpay, then back to success/failed.
      return;
    }

    // HDFC flow: window.location.href already happened inside the hook. Safe to close.
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
                  You will be redirected to a secure Razorpay payment page to
                  complete your payment.
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
        <RazorpayHostedRedirect
          {...razorpayLaunchProps}
          onClose={() => setRazorpayLaunchProps(null)}
        />
      )}
    </>
  );
}
