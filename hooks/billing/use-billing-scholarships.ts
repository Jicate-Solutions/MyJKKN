import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BillingScholarship,
  ScholarshipFilters,
  ScholarshipListResponse,
  CreateScholarshipDto,
  UpdateScholarshipDto
} from '@/types/billing-schedule';
import { BillingScholarshipService } from '@/lib/services/billing/scholarships/billing-scholarship-service';
import { toast } from 'react-hot-toast';

export function useBillingScholarships(initialFilters: ScholarshipFilters = {}) {
  const [filters, setFilters] = useState<ScholarshipFilters>({
    page: 1,
    limit: 10,
    ...initialFilters
  });

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['billing-scholarships', filters],
    queryFn: () => BillingScholarshipService.getBillingScholarships(filters),
    placeholderData: (previousData) => previousData
  });

  const updateFilters = useCallback((newFilters: Partial<ScholarshipFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: newFilters.page || 1
    }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const fetchScholarships = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['billing-scholarships'] });
  }, [queryClient]);

  return {
    scholarships: data?.data || [],
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
    fetchScholarships
  };
}

export function useBillingScholarship(id: string) {
  return useQuery({
    queryKey: ['billing-scholarship', id],
    queryFn: () => BillingScholarshipService.getBillingScholarship(id),
    enabled: !!id
  });
}

export function useCreateBillingScholarship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateScholarshipDto) =>
      BillingScholarshipService.createBillingScholarship(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-scholarships'] });
      toast.success('Scholarship applied successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to apply scholarship');
    }
  });
}

export function useUpdateBillingScholarship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateScholarshipDto }) =>
      BillingScholarshipService.updateBillingScholarship(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-scholarships'] });
      queryClient.invalidateQueries({ queryKey: ['billing-scholarship'] });
      toast.success('Scholarship updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update scholarship');
    }
  });
}

export function useDeleteBillingScholarship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      BillingScholarshipService.deleteBillingScholarship(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-scholarships'] });
      toast.success('Scholarship removed successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove scholarship');
    }
  });
}

export function useApproveScholarship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BillingScholarshipService.approveScholarship(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-scholarships'] });
      queryClient.invalidateQueries({ queryKey: ['billing-scholarship'] });
      queryClient.invalidateQueries({ queryKey: ['student-billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['billing-schedule'] });
      toast.success('Scholarship approved and bill amount updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve scholarship');
    }
  });
}

export function useRejectScholarship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      BillingScholarshipService.rejectScholarship(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-scholarships'] });
      toast.success('Scholarship rejected');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reject scholarship');
    }
  });
}

export function useReverseScholarship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BillingScholarshipService.reverseScholarship(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-scholarships'] });
      queryClient.invalidateQueries({ queryKey: ['billing-scholarship'] });
      queryClient.invalidateQueries({ queryKey: ['student-billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['billing-schedule'] });
      toast.success('Scholarship reversed and bill amounts restored');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reverse scholarship');
    }
  });
}

export function useBulkApplyScholarships() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scholarships: CreateScholarshipDto[]) =>
      BillingScholarshipService.bulkApplyScholarships(scholarships),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['billing-scholarships'] });
      if (result.success.length > 0) {
        toast.success(
          `${result.success.length} scholarships applied successfully`
        );
      }
      if (result.failed.length > 0) {
        toast.error(`Failed to apply ${result.failed.length} scholarships`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to apply bulk scholarships');
    }
  });
}
