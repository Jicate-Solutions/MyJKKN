// React Query Hook for Payment Gateway Operations
// Purpose: Client-side payment gateway integration

import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
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
        description: error.message,
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
    refetchInterval: (data) => {
      // Stop refetching if payment is in a final state
      if (data?.status && ['success', 'failed', 'cancelled', 'refunded'].includes(data.status)) {
        return false;
      }
      // Refetch every 3 seconds for pending payments
      return 3000;
    },
    retry: 3,
  });
}

/**
 * Hook to open HDFC payment gateway
 */
export function useOpenPaymentGateway() {
  const { mutateAsync, isPending } = useInitiatePayment();

  const openPaymentGateway = async (data: CreatePaymentSessionDto) => {
    try {
      const session = await mutateAsync(data);

      // Redirect to HDFC payment gateway
      window.location.href = session.payment_url;
    } catch (error) {
      // Error already handled by mutation
      console.error('[billing/payment] Failed to open payment gateway:', error);
    }
  };

  return {
    openPaymentGateway,
    isOpening: isPending,
  };
}
