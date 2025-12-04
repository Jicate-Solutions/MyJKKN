'use client';

// Payment Success Page
// Route: /billing/payment/success?transaction_id=xxx&receipt_id=xxx
// Purpose: Display payment success confirmation with enhanced UI

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Home, Receipt, Loader2, Download, ArrowRight, CheckCheck, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { usePaymentStatus } from '@/hooks/billing/use-payment-gateway';

// Success Animation Component
function SuccessAnimation() {
  return (
    <motion.div
      className="relative"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 20,
        duration: 0.6,
      }}
    >
      {/* Outer ring */}
      <motion.div
        className="absolute inset-0 rounded-full bg-green-500/20"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 2, opacity: [0, 1, 0] }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          repeatDelay: 0.5,
        }}
      />

      {/* Inner circle */}
      <motion.div
        className="relative rounded-full bg-gradient-to-br from-green-500 to-emerald-600 p-4 shadow-xl"
        initial={{ rotate: -180, scale: 0 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 200,
          damping: 15,
          delay: 0.1,
        }}
      >
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          <CheckCircle2 className="h-16 w-16 text-white" strokeWidth={2.5} />
        </motion.div>

        {/* Sparkles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              top: '50%',
              left: '50%',
            }}
            initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
            animate={{
              scale: [0, 1, 0],
              x: Math.cos((i * Math.PI) / 3) * 60,
              y: Math.sin((i * Math.PI) / 3) * 60,
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 1,
              delay: 0.6 + i * 0.1,
              ease: 'easeOut',
            }}
          >
            <Sparkles className="h-4 w-4 text-yellow-400" fill="currentColor" />
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

export default function PaymentSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const transactionId = searchParams.get('transaction_id');
  const receiptId = searchParams.get('receipt_id');
  const hdfcStatus = searchParams.get('hdfc_status');
  const hdfcOrderId = searchParams.get('hdfc_order_id');
  const amount = searchParams.get('amount'); // HDFC Requirement: Display amount on success page
  const [isLoading, setIsLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'pending' | 'failed'>('pending');
  const [showContent, setShowContent] = useState(false);

  // Verify actual payment status from database (security: don't trust URL params alone)
  const { data: verifiedStatus, isLoading: isVerifying } = usePaymentStatus(
    transactionId,
    !!transactionId
  );

  // Format amount for display (Indian Rupee format)
  const formattedAmount = amount
    ? `₹${parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  // Redirect to failed page if database status shows non-success payment
  useEffect(() => {
    if (verifiedStatus && !isVerifying) {
      // If database status is not success/processing/initiated, redirect to failed page
      if (!['success', 'processing', 'initiated'].includes(verifiedStatus.status)) {
        console.log('[billing/payment-success] Redirecting to failed page - DB status:', verifiedStatus.status);
        router.push(`/billing/payment/failed?transaction_id=${transactionId}`);
        return;
      }
      // If database confirms success, update local state
      if (verifiedStatus.status === 'success') {
        setPaymentStatus('success');
      }
    }
  }, [verifiedStatus, isVerifying, transactionId, router]);

  useEffect(() => {
    // Check payment status based on HDFC response (initial check from URL params)
    if (hdfcStatus === 'CHARGED' || hdfcStatus === 'SUCCESS' || hdfcStatus === 'COMPLETED') {
      setPaymentStatus('success');
    } else if (hdfcStatus === 'FAILED' || hdfcStatus === 'DECLINED') {
      // Redirect non-success payments to failed page
      router.push(`/billing/payment/failed?transaction_id=${transactionId}`);
      return;
    } else if (hdfcStatus && !['CHARGED', 'SUCCESS', 'COMPLETED', 'processing'].includes(hdfcStatus)) {
      // For cancelled, expired, new, etc. - redirect to failed page
      router.push(`/billing/payment/failed?transaction_id=${transactionId}`);
      return;
    }

    // Simulate loading and show animation
    const timer1 = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    const timer2 = setTimeout(() => {
      setShowContent(true);

      if (hdfcStatus === 'CHARGED' || hdfcStatus === 'SUCCESS' || hdfcStatus === 'COMPLETED') {
        toast.success('Payment Successful!', {
          description: receiptId
            ? 'Your payment has been confirmed and receipt has been generated.'
            : 'Your payment has been confirmed. Receipt will be available shortly.',
          duration: 5000,
        });
      } else {
        toast.info('Payment Initiated!', {
          description: 'Your payment has been sent to HDFC gateway. Please wait for confirmation.',
          duration: 5000,
        });
      }
    }, 2000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [hdfcStatus, receiptId]);

  if (!transactionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="max-w-md w-full shadow-lg">
            <CardHeader className="text-center">
              <CardTitle className="text-destructive">Invalid Request</CardTitle>
              <CardDescription>No transaction ID provided</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => router.push('/billing/schedule/students')}>
                <Home className="mr-2 h-4 w-4" />
                Go to Billing
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (isLoading || isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-gray-900 dark:via-green-950 dark:to-gray-800">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="relative mb-8">
            <SuccessAnimation />
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {isVerifying ? 'Verifying Payment Status' : 'Processing Your Payment'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Please wait while we confirm your transaction...
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-gray-900 dark:via-green-950 dark:to-gray-800 py-12 px-4">
      <AnimatePresence>
        {showContent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6 }}
            className="container mx-auto max-w-4xl"
          >
            {/* Success Header */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-center mb-8"
            >
              <div className="inline-flex items-center justify-center mb-4">
                <SuccessAnimation />
              </div>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3"
              >
                {paymentStatus === 'success'
                  ? 'Payment Successful!'
                  : paymentStatus === 'failed'
                  ? 'Payment Failed'
                  : 'Payment Initiated'}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto"
              >
                {paymentStatus === 'success'
                  ? receiptId
                    ? 'Your payment has been processed successfully and a receipt has been generated for your records.'
                    : 'Your payment has been processed successfully. Receipt will be available shortly.'
                  : paymentStatus === 'failed'
                  ? 'Your payment could not be processed. Please try again.'
                  : 'Your payment has been sent to HDFC gateway. Please wait for confirmation.'}
              </motion.p>
            </motion.div>

            {/* Transaction Details Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              <Card className="shadow-xl border-2 border-green-100 dark:border-green-900 overflow-hidden">
                {/* HDFC Requirement: Display Amount prominently matching HDFC payment page */}
                {formattedAmount && (
                  <div className="bg-gradient-to-r from-emerald-600 to-green-600 p-8 text-white text-center border-b border-white/10">
                    <p className="text-sm opacity-90 mb-2 uppercase tracking-wide">Amount Paid</p>
                    <p className="text-4xl md:text-5xl font-bold tracking-tight">
                      {formattedAmount}
                    </p>
                  </div>
                )}

                <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-white">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <p className="text-sm opacity-90 mb-1">Transaction ID</p>
                      <p className="font-mono text-lg font-semibold">
                        {transactionId.slice(0, 8)}...{transactionId.slice(-8)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                      <CheckCheck className="mr-1 h-3 w-3" />
                      {paymentStatus === 'success' ? 'COMPLETED' : 'PROCESSING'}
                    </Badge>
                  </div>
                </div>

                <CardContent className="p-6 space-y-6">
                  {/* Payment Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Payment Gateway</span>
                        <span className="font-semibold text-gray-900 dark:text-white">HDFC SmartGateway</span>
                      </div>

                      {hdfcOrderId && (
                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Order ID</span>
                          <span className="font-mono text-xs font-medium text-gray-900 dark:text-white">
                            {hdfcOrderId}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Payment Date</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {format(new Date(), 'dd MMM yyyy')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Payment Time</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {format(new Date(), 'hh:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Message */}
                  {paymentStatus === 'success' && receiptId && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.8, duration: 0.5 }}
                      className="bg-green-50 dark:bg-green-950 border-2 border-green-200 dark:border-green-800 rounded-lg p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-full bg-green-500 p-1.5 mt-0.5">
                          <CheckCircle2 className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                            Receipt Generated
                          </h3>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            Your payment receipt has been generated successfully. You can view and download it using the button below.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Next Steps */}
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                      <CheckCheck className="h-5 w-5" />
                      What happens next?
                    </h3>
                    <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
                      {paymentStatus === 'success' ? (
                        <>
                          <li className="flex items-start gap-2">
                            <ArrowRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>Your bill status has been updated to &quot;Paid&quot;</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ArrowRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>Receipt is available for download and printing</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ArrowRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>Payment confirmation email will be sent shortly</span>
                          </li>
                        </>
                      ) : (
                        <>
                          <li className="flex items-start gap-2">
                            <ArrowRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>HDFC will send a payment confirmation webhook</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ArrowRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>Receipt will be automatically generated upon confirmation</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ArrowRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>Your bill status will be updated to &quot;Paid&quot;</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ArrowRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>Check your billing page for updates in a few minutes</span>
                          </li>
                        </>
                      )}
                    </ul>
                  </div>

                  {/* Action Buttons */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1, duration: 0.5 }}
                    className="flex flex-col sm:flex-row gap-3 pt-4"
                  >
                    {receiptId && paymentStatus === 'success' && (
                      <Button
                        size="lg"
                        className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg"
                        onClick={() => router.push(`/billing/receipts/${receiptId}`)}
                      >
                        <Receipt className="mr-2 h-5 w-5" />
                        View Receipt
                      </Button>
                    )}
                    <Button
                      size="lg"
                      variant={receiptId && paymentStatus === 'success' ? 'outline' : 'default'}
                      className="flex-1"
                      onClick={() => {
                        // Navigate to student's individual bill page if student_id is available
                        const studentId = verifiedStatus?.student_id;
                        if (studentId) {
                          router.push(`/billing/schedule/students/${studentId}`);
                        } else {
                          router.push('/billing/schedule/students');
                        }
                      }}
                    >
                      <Receipt className="mr-2 h-5 w-5" />
                      View My Bills
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="flex-1"
                      onClick={() => router.push('/dashboard')}
                    >
                      <Home className="mr-2 h-5 w-5" />
                      Dashboard
                    </Button>
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Support Note */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.5 }}
              className="text-center mt-8 text-sm text-gray-600 dark:text-gray-400"
            >
              <p>
                Need help? Contact our support team or check your billing page for transaction history.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
