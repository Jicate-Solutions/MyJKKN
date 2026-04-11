/**
 * React Query hooks for Leave/OnDuty Sub-Categories
 *
 * Feeds the admin UI in /academic/leave-onduty/settings (Sub-Categories tab)
 * and the sub-category dropdowns in the approval flow builder and
 * learner application form.
 *
 * @module hooks/academic/use-leave-onduty-sub-categories
 * @created 2026-04-11
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  LeaveOndutySubCategoryService,
  SubCategoryListFilters,
} from '@/lib/services/academic/leave-onduty-sub-category-service';
import type { SubCategoryFormData } from '@/types/leave-onduty';

const KEYS = {
  all: ['leave-onduty', 'sub-categories'] as const,
  list: (
    institutionId: string | null,
    filters?: SubCategoryListFilters
  ) => [...KEYS.all, 'list', institutionId ?? 'all', filters] as const,
};

/**
 * List sub-categories for an institution.
 * Pass null or undefined for super admin view (returns all institutions).
 */
export function useLeaveOndutySubCategories(
  institutionId: string | null | undefined,
  filters?: SubCategoryListFilters,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: KEYS.list(institutionId ?? null, filters),
    queryFn: () =>
      LeaveOndutySubCategoryService.list(institutionId ?? null, filters),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000, // 5 minutes — rarely changes
  });
}

export function useCreateLeaveOndutySubCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      data,
      createdBy,
    }: {
      data: SubCategoryFormData;
      createdBy: string | null;
    }) => LeaveOndutySubCategoryService.create(data, createdBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
      toast.success('Sub-category created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create sub-category');
    },
  });
}

export function useUpdateLeaveOndutySubCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Pick<SubCategoryFormData, 'name' | 'description'>>;
    }) => LeaveOndutySubCategoryService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
      toast.success('Sub-category updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update sub-category');
    },
  });
}

export function useSetLeaveOndutySubCategoryActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      LeaveOndutySubCategoryService.setActive(id, isActive),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
      toast.success(
        variables.isActive ? 'Sub-category activated' : 'Sub-category deactivated'
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to change status');
    },
  });
}

export function useDeleteLeaveOndutySubCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => LeaveOndutySubCategoryService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
      toast.success('Sub-category deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete sub-category');
    },
  });
}
