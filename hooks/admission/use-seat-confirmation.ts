// hooks/admission/use-seat-confirmation.ts
// React Query hooks for seat confirmation and admission payments

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  SeatConfirmationService,
  type PaymentFilters,
  type RecordPaymentInput,
  type RefundInput,
} from '@/lib/services/admission/seat-confirmation-service';

export const paymentKeys = {
  all: ['admission-payments'] as const,
  lists: () => [...paymentKeys.all, 'list'] as const,
  list: (filters: PaymentFilters) => [...paymentKeys.lists(), filters] as const,
  stats: (institutionId: string) => [...paymentKeys.all, 'stats', institutionId] as const,
};

export function useAdmissionPayments(filters: PaymentFilters) {
  const query = useQuery({
    queryKey: paymentKeys.list(filters),
    queryFn: () => SeatConfirmationService.getPayments(filters),
    enabled: !!filters.institutionId,
  });

  return {
    payments: query.data?.data || [],
    metadata: query.data?.metadata,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function usePaymentStats(institutionId: string) {
  const query = useQuery({
    queryKey: paymentKeys.stats(institutionId),
    queryFn: () => SeatConfirmationService.getPaymentStats(institutionId),
    enabled: !!institutionId,
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useRecordPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordPaymentInput) => SeatConfirmationService.recordPayment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      toast.success('Payment recorded successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to record payment: ${error.message}`);
    },
  });
}

export function useProcessRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RefundInput) => SeatConfirmationService.processRefund(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      toast.success('Refund request initiated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to process refund: ${error.message}`);
    },
  });
}
