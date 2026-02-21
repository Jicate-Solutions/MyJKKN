'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessBillingService } from '@/lib/services/campus-living/mess-billing-service';
import type {
  MessBillingPeriod,
  MessStudentBilling,
} from '@/types/campus-living';

// Query key factory
export const messBillingKeys = {
  all: ['mess-billing'] as const,
  periods: (filters: Record<string, unknown>) => ['mess-billing', 'periods', filters] as const,
  studentBilling: (filters: Record<string, unknown>) => ['mess-billing', 'student', filters] as const,
  periodDetail: (id: string) => ['mess-billing', 'period', id] as const,
  studentBillingDetail: (id: string) => ['mess-billing', 'student-detail', id] as const,
};

// --- Query hooks ---

export function useMessBillingPeriods(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: messBillingKeys.periods({ institutionId, ...filters }),
    queryFn: () => MessBillingService.getBillingPeriods(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useMessBillingPeriod(id: string) {
  return useQuery({
    queryKey: messBillingKeys.periodDetail(id),
    queryFn: () => MessBillingService.getBillingPeriod(id),
    enabled: !!id,
  });
}

export function useMessStudentBilling(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: messBillingKeys.studentBilling({ institutionId, ...filters }),
    queryFn: () => MessBillingService.getStudentBilling(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useMessStudentBillingDetail(id: string) {
  return useQuery({
    queryKey: messBillingKeys.studentBillingDetail(id),
    queryFn: () => MessBillingService.getStudentBillingDetail(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useGenerateBilling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { institution_id: string; billing_period_id: string }) =>
      MessBillingService.generateBilling(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messBillingKeys.all });
      toast.success('Billing generated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate billing: ${error.message}`);
    },
  });
}

export function useCreateMessBillingPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<MessBillingPeriod, 'id' | 'created_at'>) =>
      MessBillingService.createBillingPeriod(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messBillingKeys.all });
      toast.success('Billing period created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create billing period: ${error.message}`);
    },
  });
}

export function useUpdateMessBillingPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<MessBillingPeriod> }) =>
      MessBillingService.updateBillingPeriod(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messBillingKeys.all });
      queryClient.invalidateQueries({ queryKey: messBillingKeys.periodDetail(variables.id) });
      toast.success('Billing period updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update billing period: ${error.message}`);
    },
  });
}

export function useDeleteMessBillingPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => MessBillingService.deleteBillingPeriod(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messBillingKeys.all });
      toast.success('Billing period deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete billing period: ${error.message}`);
    },
  });
}
