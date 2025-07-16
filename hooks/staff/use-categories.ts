import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  EmploymentCategory,
  CategoryFilters,
  CategoryListResponse,
  CreateEmploymentCategoryDto,
  UpdateEmploymentCategoryDto
} from '@/types/staff';
import { CategoryService } from '@/lib/services/staff/category-service';
import { useAuth } from '../use-auth';

export type CategoryData = EmploymentCategory;

// Query key factory for categories
export const categoryKeys = {
  all: ['staff-categories'] as const,
  lists: () => [...categoryKeys.all, 'list'] as const,
  list: (filters: CategoryFilters) =>
    [...categoryKeys.lists(), filters] as const,
  details: () => [...categoryKeys.all, 'detail'] as const,
  detail: (id: string) => [...categoryKeys.details(), id] as const
};

// Get a list of categories with filters (follows student/staff module pattern)
export function useCategories(filters: CategoryFilters = {}) {
  const { profile, isLoading: authLoading } = useAuth();

  const queryFn = async () => {
    try {
      return await CategoryService.getCategories(filters);
    } catch (error) {
      console.error('[useCategories] Fetch Error:', error);
      throw new Error(
        'Failed to fetch categories. Please check the console for details.'
      );
    }
  };

  return useQuery({
    queryKey: ['staff-categories', filters],
    queryFn,
    // Simple enabled logic like student/staff modules
    enabled: !authLoading && !!profile
  });
}

// Get a single category by ID
export const useCategory = (id: string) => {
  return useQuery({
    queryKey: categoryKeys.detail(id),
    queryFn: () => CategoryService.getCategory(id),
    enabled: !!id
  });
};

// Create a new category
export const useCreateCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEmploymentCategoryDto) =>
      CategoryService.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
    }
  });
};

// Update an existing category
export const useUpdateCategory = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateEmploymentCategoryDto) =>
      CategoryService.updateCategory(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
      queryClient.setQueryData(categoryKeys.detail(id), data);
    }
  });
};

// Delete a category
export const useDeleteCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => CategoryService.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
    }
  });
};

// Bulk delete categories
export const useBulkDeleteCategories = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => CategoryService.bulkDeleteCategories(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
    }
  });
};
