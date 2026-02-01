'use client';

// hooks/grievance/use-grievance-categories.ts
// F004: Grievance Ticketing System - Category Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import type {
  GrievanceCategory,
  CreateGrievanceCategoryDto,
  UpdateGrievanceCategoryDto
} from '@/types/grievance';

// Query keys
export const grievanceCategoryKeys = {
  all: ['grievance-categories'] as const,
  lists: () => [...grievanceCategoryKeys.all, 'list'] as const,
  list: (institutionId: string) => [...grievanceCategoryKeys.lists(), institutionId] as const,
  tree: (institutionId: string) => [...grievanceCategoryKeys.all, 'tree', institutionId] as const,
  detail: (id: string) => [...grievanceCategoryKeys.all, 'detail', id] as const
};

/**
 * Hook to fetch categories in tree structure
 */
export function useGrievanceCategories(institutionId: string) {
  return useQuery({
    queryKey: grievanceCategoryKeys.tree(institutionId),
    queryFn: () => GrievanceService.getCategories(institutionId),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

/**
 * Hook to fetch all categories (flat list)
 */
export function useAllGrievanceCategories(institutionId: string, includeInactive = false) {
  return useQuery({
    queryKey: [...grievanceCategoryKeys.list(institutionId), includeInactive],
    queryFn: () => GrievanceService.getAllCategories(institutionId, includeInactive),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Hook to fetch a single category
 */
export function useGrievanceCategory(id: string) {
  return useQuery({
    queryKey: grievanceCategoryKeys.detail(id),
    queryFn: () => GrievanceService.getCategory(id),
    enabled: !!id
  });
}

/**
 * Hook to create a category
 */
export function useCreateGrievanceCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateGrievanceCategoryDto) =>
      GrievanceService.createCategory(data),
    onSuccess: (_, variables) => {
      toast.success('Category created successfully');
      queryClient.invalidateQueries({
        queryKey: grievanceCategoryKeys.list(variables.institution_id)
      });
      queryClient.invalidateQueries({
        queryKey: grievanceCategoryKeys.tree(variables.institution_id)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create category');
    }
  });
}

/**
 * Hook to update a category
 */
export function useUpdateGrievanceCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGrievanceCategoryDto }) =>
      GrievanceService.updateCategory(id, data),
    onSuccess: (updatedCategory) => {
      toast.success('Category updated successfully');
      queryClient.invalidateQueries({
        queryKey: grievanceCategoryKeys.detail(updatedCategory.id)
      });
      queryClient.invalidateQueries({
        queryKey: grievanceCategoryKeys.list(updatedCategory.institution_id)
      });
      queryClient.invalidateQueries({
        queryKey: grievanceCategoryKeys.tree(updatedCategory.institution_id)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update category');
    }
  });
}

/**
 * Hook to delete a category
 */
export function useDeleteGrievanceCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, institutionId }: { id: string; institutionId: string }) =>
      GrievanceService.deleteCategory(id),
    onSuccess: (_, variables) => {
      toast.success('Category deleted successfully');
      queryClient.invalidateQueries({
        queryKey: grievanceCategoryKeys.list(variables.institutionId)
      });
      queryClient.invalidateQueries({
        queryKey: grievanceCategoryKeys.tree(variables.institutionId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete category');
    }
  });
}

/**
 * Hook to seed default categories
 */
export function useSeedGrievanceCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (institutionId: string) =>
      GrievanceService.seedCategories(institutionId),
    onSuccess: (_, institutionId) => {
      toast.success('Default categories created successfully');
      queryClient.invalidateQueries({
        queryKey: grievanceCategoryKeys.list(institutionId)
      });
      queryClient.invalidateQueries({
        queryKey: grievanceCategoryKeys.tree(institutionId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to seed categories');
    }
  });
}
