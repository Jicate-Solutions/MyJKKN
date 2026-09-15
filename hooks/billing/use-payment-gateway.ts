// React Query Hook for Payment Gateway Operations
// Purpose: Client-side payment gateway integration

import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { paymentStatusPollInterval } from '@/lib/billing/payment-status-flow';
import type {
  CreatePaymentSessionDto,
  PaymentSessionResponse,
  PaymentStatusCheckResponse,
} from '@/types/payment-gateway';

// ============================================================================
// API Client Functions
// ============================================================================

async function initiatePayment(
  data: CreatePaymentSessionDto
): Promise<PaymentSessionResponse> {
  const response = await fetch('/api/billing/payment/initiate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to initiate payment');
  }

  const result = await response.json();
  return result.data;
}

async function checkPaymentStatus(
  transactionId: string
): Promise<PaymentStatusCheckResponse> {
  const response = await fetch(`/api/billing/payment/status/${transactionId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to check payment status');
  }

  const result = await response.json();
  return result.data;
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to initiate payment session
 */
export function useInitiatePayment() {
  return useMutation({
    mutationFn: initiatePayment,
    onSuccess: (data) => {
      // Don't show success toast here, as we'll redirect to payment gateway
      console.log('[billing/payment] Payment session created:', data.session_id);
    },
    onError: (error: Error) => {
      toast.error('Payment Initiation Failed', {
        
      });
    },
  });
}

/**
 * Hook to check payment status
 */
export function usePaymentStatus(transactionId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['payment-status', transactionId],
    queryFn: () => checkPaymentStatus(transactionId!),
    enabled: enabled && !!transactionId,
    refetchInterval: (query) => {
      // All three stop conditions live in `paymentStatusPollInterval`:
      //
      //  1. Terminal status. This used to be an inline allow-list of
      //     ['success','failed','cancelled','refunded'] that omitted `expired`
      //     — 33% of production rows — so an expired transaction polled
      //     forever AND re-fired the success page's redirect on every tick.
      //     The shared classifier is exhaustive over `PaymentStatus`.
      //  2. A persistently failing endpoint. This condition keys off `data`,
      //     which stays undefined while every request errors, so a failing
      //     status check used to poll forever: 4 requests (1 + `retry`) every
      //     3 seconds for as long as the tab stayed open. That is what the
      //     learner-403 bug looked like from the network panel.
      //  3. A hard ceiling on total fetches, so an unrecognised status can
      //     never reopen the endless-poll hole.
      return paymentStatusPollInterval({
        status: query.state.data?.status,
        isErrored: query.state.status === 'error',
        errorUpdateCount: query.state.errorUpdateCount,
        fetchCount: query.state.dataUpdateCount + query.state.errorUpdateCount,
      });
    },
    retry: 3,
  });
}

/**
 * Hook to open the payment gateway. Returns the session so the caller can
 * decide how to launch: HDFC redirects here, while Razorpay hands the session
 * to <RazorpayHostedRedirect>, which POSTs a form to Razorpay's hosted checkout
 * page. The legacy HDFC redirect happens here for backward compatibility when
 * the caller doesn't intercept the return value.
 */
export function useOpenPaymentGateway() {
  const { mutateAsync, isPending } = useInitiatePayment();

  const openPaymentGateway = async (data: CreatePaymentSessionDto): Promise<PaymentSessionResponse | null> => {
    try {
      const session = await mutateAsync(data);

      // Razorpay sessions: return to the caller — DO NOT redirect here. The
      // caller (e.g. OnlinePaymentButton) mounts <RazorpayHostedRedirect> with
      // these props, which POSTs a form that navigates to Razorpay's hosted page.
      if (session.provider === 'razorpay') {
        return session;
      }

      // HDFC SmartGateway path — redirect to the hosted payment page.
      if (session.payment_url) {
        window.location.href = session.payment_url;
      }
      return session;
    } catch (error) {
      // Error already handled by mutation
      console.error('[billing/payment] Failed to open payment gateway:', error);
      return null;
    }
  };

  return {
    openPaymentGateway,
    isOpening: isPending,
  };
}
