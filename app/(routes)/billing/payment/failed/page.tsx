'use client';

// Payment Failed Page
// Route: /billing/payment/failed?transaction_id=xxx
// Purpose: Display payment failure information with enhanced UI

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  XCircle,
  RefreshCw,
  Home,
  AlertTriangle,
  AlertCircle,
  Info,
  ArrowRight,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { usePaymentStatus } from '@/hooks/billing/use-payment-gateway';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// Failure Animation Component
function FailureAnimation({ status }: { status: string }) {
  const isCancelled = status === 'cancelled';
  const Icon = isCancelled ? AlertTriangle : XCircle;
  const colorFrom = isCancelled ? 'from-orange-500' : 'from-red-500';
  const colorTo = isCancelled ? 'to-amber-600' : 'to-rose-600';
  const ringColor = isCancelled ? 'bg-orange-500/20' : 'bg-red-500/20';

  return (
    <motion.div
      className='relative'
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 20,
        duration: 0.6
      }}
    >
      {/* Outer ring */}
      <motion.div
        className={`absolute inset-0 rounded-full ${ringColor}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 2, opacity: [0, 0.5, 0] }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          repeatDelay: 0.5
        }}
      />

      {/* Inner circle */}
      <motion.div
        className={`relative rounded-full bg-gradient-to-br ${colorFrom} ${colorTo} p-4 shadow-xl`}
        initial={{ rotate: 180, scale: 0 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 200,
          damping: 15,
          delay: 0.1
        }}
      >
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          <Icon className='h-16 w-16 text-white' strokeWidth={2.5} />
        </motion.div>
      </motion.div>

      {/* Shake animation */}
      <motion.div
        className='absolute inset-0'
        animate={{
          x: [0, -2, 2, -2, 2, 0]
        }}
        transition={{
          duration: 0.5,
          delay: 0.8,
          ease: 'easeInOut'
        }}
      />
    </motion.div>
  );
}

export default function PaymentFailedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const transactionId = searchParams.get('transaction_id');
  const [showContent, setShowContent] = useState(false);

  const {
    data: paymentStatus,
    isLoading,
    error
  } = usePaymentStatus(transactionId, !!transactionId);

  useEffect(() => {
    if (
      paymentStatus &&
      ['failed', 'cancelled', 'expired'].includes(paymentStatus.status)
    ) {
      const statusMessages: Record<string, string> = {
        failed: 'Payment failed. Please try again.',
        cancelled: 'Payment was cancelled.',
        expired: 'Payment session expired. Please try again.'
      };

      // Delay to show animation first
      setTimeout(() => {
        toast.error('Payment Not Completed', {
          description: statusMessages[paymentStatus.status],
          duration: 5000
        });
      }, 1500);
    }

    // Show content after animation
    const timer = setTimeout(() => {
      setShowContent(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [paymentStatus]);

  if (!transactionId) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4'>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className='max-w-md w-full shadow-lg'>
            <CardHeader className='text-center'>
              <CardTitle className='text-destructive'>
                Invalid Request
              </CardTitle>
              <CardDescription>No transaction ID provided</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className='w-full'
                onClick={() => router.push('/billing/schedule/students')}
              >
                <Home className='mr-2 h-4 w-4' />
                Go to Billing
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (isLoading || !showContent) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 dark:from-gray-900 dark:via-red-950 dark:to-gray-800'>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className='text-center'
        >
          <div className='relative mb-8 flex justify-center'>
            {isLoading ? (
              <Loader2 className='h-16 w-16 animate-spin text-red-600' />
            ) : (
              <FailureAnimation status={paymentStatus?.status || 'failed'} />
            )}
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          >
            <h2 className='text-2xl font-bold text-gray-900 dark:text-white mb-2'>
              Processing Transaction...
            </h2>
            <p className='text-gray-600 dark:text-gray-400'>
              Please wait while we fetch transaction details...
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  if (error || !paymentStatus) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-red-950 p-4'>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className='max-w-md w-full shadow-lg'>
            <CardHeader className='text-center'>
              <div className='flex justify-center mb-4'>
                <AlertCircle className='h-12 w-12 text-destructive' />
              </div>
              <CardTitle className='text-destructive'>
                Error Loading Payment Status
              </CardTitle>
              <CardDescription>
                {error instanceof Error
                  ? error.message
                  : 'Failed to load payment details'}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Button
                className='w-full'
                onClick={() => router.push('/billing/schedule/students')}
              >
                <Home className='mr-2 h-4 w-4' />
                Go to Billing
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Redirect if payment is successful
  if (paymentStatus.status === 'success') {
    router.push(`/billing/payment/success?transaction_id=${transactionId}`);
    return null;
  }

  const getStatusInfo = (status: string) => {
    const statusInfo: Record<
      string,
      { title: string; description: string; color: string; bgGradient: string }
    > = {
      failed: {
        title: 'Payment Failed',
        description:
          'Your payment could not be processed. Please check your payment details and try again.',
        color: 'text-red-600 dark:text-red-400',
        bgGradient: 'from-red-500 to-rose-600'
      },
      cancelled: {
        title: 'Payment Cancelled',
        description:
          'You cancelled the payment. No charges were made to your account.',
        color: 'text-orange-600 dark:text-orange-400',
        bgGradient: 'from-orange-500 to-amber-600'
      },
      expired: {
        title: 'Payment Session Expired',
        description:
          'The payment session has expired. Please initiate a new payment.',
        color: 'text-yellow-600 dark:text-yellow-400',
        bgGradient: 'from-yellow-500 to-amber-600'
      },
      processing: {
        title: 'Payment Processing',
        description:
          'Your payment is still being processed. Please check back later.',
        color: 'text-blue-600 dark:text-blue-400',
        bgGradient: 'from-blue-500 to-indigo-600'
      }
    };

    return statusInfo[status] || statusInfo.failed;
  };

  const statusInfo = getStatusInfo(paymentStatus.status);

  return (
    <div className='min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 dark:from-gray-900 dark:via-red-950 dark:to-gray-800 py-12 px-4'>
      <AnimatePresence>
        {showContent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6 }}
            className='container mx-auto max-w-4xl'
          >
            {/* Failure Header */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className='text-center mb-8'
            >
              <div className='inline-flex items-center justify-center mb-4'>
                <FailureAnimation status={paymentStatus.status} />
              </div>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className='text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3'
              >
                {statusInfo.title}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className='text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto'
              >
                {statusInfo.description}
              </motion.p>
            </motion.div>

            {/* Transaction Details Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              <Card className='shadow-xl border-2 border-red-100 dark:border-red-900 overflow-hidden'>
                <div
                  className={`bg-gradient-to-r ${statusInfo.bgGradient} p-6 text-white`}
                >
                  <div className='flex items-center justify-between'>
                    <div>
                      <p className='text-sm opacity-90 mb-1'>Transaction ID</p>
                      <p className='font-mono text-lg font-semibold'>
                        {paymentStatus.transaction_id.slice(0, 8)}...
                        {paymentStatus.transaction_id.slice(-8)}
                      </p>
                    </div>
                    <Badge
                      variant='secondary'
                      className='bg-white/20 text-white border-white/30'
                    >
                      {paymentStatus.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <CardContent className='p-6 space-y-6'>
                  {/* Payment Details */}
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div className='space-y-3'>
                      <div className='flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg'>
                        <span className='text-sm text-gray-600 dark:text-gray-400'>
                          Bills Selected
                        </span>
                        <span className='font-semibold text-gray-900 dark:text-white'>
                          {paymentStatus.bills_paid}
                        </span>
                      </div>

                      {paymentStatus.payment_method && (
                        <div className='flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg'>
                          <span className='text-sm text-gray-600 dark:text-gray-400'>
                            Payment Method
                          </span>
                          <span className='font-semibold text-gray-900 dark:text-white'>
                            {paymentStatus.payment_method.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className='space-y-3'>
                      <div className='flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg'>
                        <span className='text-sm text-gray-600 dark:text-gray-400'>
                          Attempt Date
                        </span>
                        <span className='font-semibold text-gray-900 dark:text-white'>
                          {format(new Date(), 'dd MMM yyyy')}
                        </span>
                      </div>

                      <div className='flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg'>
                        <span className='text-sm text-gray-600 dark:text-gray-400'>
                          Attempt Time
                        </span>
                        <span className='font-semibold text-gray-900 dark:text-white'>
                          {format(new Date(), 'hh:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className='border-t border-gray-200 dark:border-gray-700 pt-4'>
                    <div className='flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-4 rounded-lg'>
                      <span className='text-lg font-semibold text-gray-700 dark:text-gray-300'>
                        Amount
                      </span>
                      <span className='text-3xl font-bold text-gray-900 dark:text-white'>
                        ₹
                        {paymentStatus.amount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Common Reasons for Failure */}
                  {paymentStatus.status === 'failed' && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.8, duration: 0.5 }}
                      className='bg-yellow-50 dark:bg-yellow-950 border-2 border-yellow-200 dark:border-yellow-800 rounded-lg p-4'
                    >
                      <div className='flex items-start gap-3'>
                        <div className='rounded-full bg-yellow-500 p-1.5 mt-0.5'>
                          <HelpCircle className='h-4 w-4 text-white' />
                        </div>
                        <div className='flex-1'>
                          <h3 className='font-semibold text-yellow-900 dark:text-yellow-100 mb-2'>
                            Common reasons for payment failure:
                          </h3>
                          <ul className='text-sm text-yellow-800 dark:text-yellow-200 space-y-1.5'>
                            <li className='flex items-start gap-2'>
                              <ArrowRight className='h-4 w-4 mt-0.5 flex-shrink-0' />
                              <span>Insufficient funds in your account</span>
                            </li>
                            <li className='flex items-start gap-2'>
                              <ArrowRight className='h-4 w-4 mt-0.5 flex-shrink-0' />
                              <span>Incorrect card details or CVV</span>
                            </li>
                            <li className='flex items-start gap-2'>
                              <ArrowRight className='h-4 w-4 mt-0.5 flex-shrink-0' />
                              <span>Card expired or blocked by bank</span>
                            </li>
                            <li className='flex items-start gap-2'>
                              <ArrowRight className='h-4 w-4 mt-0.5 flex-shrink-0' />
                              <span>Daily transaction limit exceeded</span>
                            </li>
                            <li className='flex items-start gap-2'>
                              <ArrowRight className='h-4 w-4 mt-0.5 flex-shrink-0' />
                              <span>Network or connectivity issues</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* What You Can Do */}
                  <div className='bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4'>
                    <div className='flex items-start gap-3'>
                      <div className='rounded-full bg-blue-500 p-1.5 mt-0.5'>
                        <Info className='h-4 w-4 text-white' />
                      </div>
                      <div className='flex-1'>
                        <h3 className='font-semibold text-blue-900 dark:text-blue-100 mb-2'>
                          What you can do:
                        </h3>
                        <ul className='text-sm text-blue-800 dark:text-blue-200 space-y-1.5'>
                          <li className='flex items-start gap-2'>
                            <ArrowRight className='h-4 w-4 mt-0.5 flex-shrink-0' />
                            <span>
                              Check your payment details and try again
                            </span>
                          </li>
                          <li className='flex items-start gap-2'>
                            <ArrowRight className='h-4 w-4 mt-0.5 flex-shrink-0' />
                            <span>Contact your bank if the issue persists</span>
                          </li>
                          <li className='flex items-start gap-2'>
                            <ArrowRight className='h-4 w-4 mt-0.5 flex-shrink-0' />
                            <span>Try using a different payment method</span>
                          </li>
                          <li className='flex items-start gap-2'>
                            <ArrowRight className='h-4 w-4 mt-0.5 flex-shrink-0' />
                            <span>Contact support if you need assistance</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1, duration: 0.5 }}
                    className='flex flex-col sm:flex-row gap-3 pt-4'
                  >
                    <Button
                      size='lg'
                      className='flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg'
                      onClick={() => router.push('/billing/schedule/students')}
                    >
                      <RefreshCw className='mr-2 h-5 w-5' />
                      Try Again
                    </Button>
                    <Button
                      size='lg'
                      variant='outline'
                      className='flex-1'
                      onClick={() => router.push('/dashboard')}
                    >
                      <Home className='mr-2 h-5 w-5' />
                      Go to Dashboard
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
              className='text-center mt-8 text-sm text-gray-600 dark:text-gray-400'
            >
              <p>
                Having trouble? Contact our support team for assistance with
                your payment.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
