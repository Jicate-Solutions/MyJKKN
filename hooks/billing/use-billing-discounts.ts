import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BillingDiscount,
  DiscountFilters,
  DiscountListResponse,
  CreateDiscountDto,
  UpdateDiscountDto
} from '@/types/billing-schedule';
import { BillingDiscountService } from '@/lib/services/billing/discounts/billing-discount-service';
import { toast } from 'react-hot-toast';

export function useBillingDiscounts(initialFilters: DiscountFilters = {}) {
  const [filters, setFilters] = useState<DiscountFilters>({
    page: 1,
    limit: 10,
    ...initialFilters
  });

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['billing-discounts', filters],
    queryFn: () => BillingDiscountService.getBillingDiscounts(filters),
    placeholderData: (previousData) => previousData
  });

  const updateFilters = useCallback((newFilters: Partial<DiscountFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: newFilters.page || 1
    }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const fetchDiscounts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['billing-discounts', filters] });
  }, [queryClient, filters]);

  return {
    discounts: data?.data || [],
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
    fetchDiscounts
  };
}

export function useBillingDiscount(id: string) {
  return useQuery({
    queryKey: ['billing-discount', id],
    queryFn: () => BillingDiscountService.getBillingDiscount(id),
    enabled: !!id
  });
}

export function useCreateBillingDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDiscountDto) =>
      BillingDiscountService.createBillingDiscount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-discounts'] });
      toast.success('Discount applied successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to apply discount');
    }
  });
}

export function useUpdateBillingDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDiscountDto }) =>
      BillingDiscountService.updateBillingDiscount(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['billing-discounts'] });
      queryClient.invalidateQueries({ queryKey: ['billing-discount', variables.id] });
      toast.success('Discount updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update discount');
    }
  });
}

export function useDeleteBillingDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      BillingDiscountService.deleteBillingDiscount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-discounts'] });
      toast.success('Discount removed successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove discount');
    }
  });
}

export function useApproveDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BillingDiscountService.approveDiscount(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['billing-discounts'] });
      queryClient.invalidateQueries({ queryKey: ['billing-discount', id] });
      queryClient.invalidateQueries({ queryKey: ['student-billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['billing-schedule'] });
      toast.success('Discount approved and bill amount updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve discount');
    }
  });
}

export function useRejectDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      BillingDiscountService.rejectDiscount(id, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['billing-discounts'] });
      queryClient.invalidateQueries({ queryKey: ['billing-discount', variables.id] });
      toast.success('Discount rejected');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reject discount');
    }
  });
}

export function useReverseDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BillingDiscountService.reverseDiscount(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['billing-discounts'] });
      queryClient.invalidateQueries({ queryKey: ['billing-discount', id] });
      queryClient.invalidateQueries({ queryKey: ['student-billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['billing-schedule'] });
      toast.success('Discount reversed and bill amounts restored');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reverse discount');
    }
  });
}

export function useBulkApplyDiscounts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (discounts: CreateDiscountDto[]) =>
      BillingDiscountService.bulkApplyDiscounts(discounts),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['billing-discounts'] });
      if (result.success.length > 0) {
        toast.success(
          `${result.success.length} discounts applied successfully`
        );
      }
      if (result.failed.length > 0) {
        toast.error(`Failed to apply ${result.failed.length} discounts`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to apply bulk discounts');
    }
  });
}

// ============================================
// OUTCOME-BASED DISCOUNT HOOKS
// ============================================

export function useCreateOutcomeDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDiscountDto) =>
      BillingDiscountService.createOutcomeDiscount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-discounts'] });
      queryClient.invalidateQueries({ queryKey: ['outcome-discounts'] });
      toast.success('Outcome-based discount created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create outcome discount');
    }
  });
}

export function useVerifyOutcomeDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      discountId,
      verifiedBy,
      evidence
    }: {
      discountId: string;
      verifiedBy: string;
      evidence: string[];
    }) =>
      BillingDiscountService.verifyOutcomeDiscount(
        discountId,
        verifiedBy,
        evidence
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-discounts'] });
      queryClient.invalidateQueries({ queryKey: ['billing-discount'] });
      queryClient.invalidateQueries({ queryKey: ['outcome-discounts'] });
      toast.success('Outcome discount verified successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to verify outcome discount');
    }
  });
}

export function useOutcomeDiscounts(institutionId: string) {
  return useQuery({
    queryKey: ['outcome-discounts', institutionId],
    queryFn: () => BillingDiscountService.getOutcomeDiscounts(institutionId),
    enabled: !!institutionId
  });
}
