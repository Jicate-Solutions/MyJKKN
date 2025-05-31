import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BillingRefund,
  RefundFilters,
  RefundListResponse,
  CreateRefundDto,
  UpdateRefundDto
} from '@/types/billing-schedule';
import { BillingRefundService } from '@/lib/services/billing/refunds/billing-refund-service';
import { studentSearchKeys } from './use-student-search';
import { toast } from 'react-hot-toast';

export function useBillingRefunds(initialFilters: RefundFilters = {}) {
  const [filters, setFilters] = useState<RefundFilters>({
    page: 1,
    limit: 10,
    ...initialFilters
  });

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['billing-refunds', filters],
    queryFn: () => BillingRefundService.getBillingRefunds(filters),
    placeholderData: (previousData) => previousData
  });

  const updateFilters = useCallback((newFilters: Partial<RefundFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: newFilters.page || 1
    }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const fetchRefunds = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['billing-refunds'] });
  }, [queryClient]);

  return {
    refunds: data?.data || [],
    metadata: data?.metadata || {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0
    },
    loading: isLoading,
    error: error?.message,
    filters,
    updateFilters,
    changePage,
    fetchRefunds
  };
}

export function useBillingRefund(id: string) {
  return useQuery({
    queryKey: ['billing-refund', id],
    queryFn: () => BillingRefundService.getBillingRefund(id),
    enabled: !!id
  });
}

export function useCreateBillingRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRefundDto) =>
      BillingRefundService.createBillingRefund(data),
    onSuccess: (refund) => {
      // Invalidate refund queries
      queryClient.invalidateQueries({ queryKey: ['billing-refunds'] });

      // Invalidate receipt queries since refunds are linked to receipts
      queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['billing-receipt'] });

      // If we can determine the student ID from the refund data, invalidate student-specific queries
      if (refund.receipt?.student_id) {
        const studentId = refund.receipt.student_id;

        // Invalidate student billing summary and detail queries for real-time updates
        queryClient.invalidateQueries({
          queryKey: studentSearchKeys.summary(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentSearchKeys.detail(studentId)
        });
      }

      toast.success('Refund request created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create refund request');
    }
  });
}

export function useUpdateBillingRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRefundDto }) =>
      BillingRefundService.updateBillingRefund(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-refunds'] });
      queryClient.invalidateQueries({ queryKey: ['billing-refund'] });
      toast.success('Refund updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update refund');
    }
  });
}

export function useDeleteBillingRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BillingRefundService.deleteBillingRefund(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-refunds'] });
      toast.success('Refund cancelled successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel refund');
    }
  });
}

export function useApproveRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BillingRefundService.approveRefund(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-refunds'] });
      toast.success('Refund approved successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve refund');
    }
  });
}

export function useProcessRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BillingRefundService.processRefund(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-refunds'] });
      toast.success('Refund processed successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process refund');
    }
  });
}

export function useBulkProcessRefunds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (refunds: CreateRefundDto[]) =>
      BillingRefundService.bulkProcessRefunds(refunds),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['billing-refunds'] });
      if (result.success.length > 0) {
        toast.success(
          `${result.success.length} refunds processed successfully`
        );
      }
      if (result.failed.length > 0) {
        toast.error(`Failed to process ${result.failed.length} refunds`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process bulk refunds');
    }
  });
}
