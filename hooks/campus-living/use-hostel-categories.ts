import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HostelCategoryService } from '@/lib/services/campus-living/hostel-category-service';
import type {
  HostelCategoryFilters,
  CreateHostelCategoryDto,
  UpdateHostelCategoryDto,
} from '@/types/hostel-categories';

// Shared React Query key. Every component that calls useHostelCategories()
// subscribes to the SAME cache entry, so a mutation in the form dialog / row
// actions invalidates this key and the rendered data-table refetches — no
// page reload needed. (A plain useState hook gave each component an isolated
// state instance, so mutations only refreshed an orphan instance.)
const HOSTEL_CATEGORIES_KEY = ['campus-living', 'hostel-categories'] as const;

const EMPTY_METADATA = { total: 0, page: 1, limit: 100, totalPages: 0 };

export function useHostelCategories(initialFilters: HostelCategoryFilters = {}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<HostelCategoryFilters>(initialFilters);

  const query = useQuery({
    queryKey: [...HOSTEL_CATEGORIES_KEY, filters],
    queryFn: () => HostelCategoryService.getCategories(filters),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: HOSTEL_CATEGORIES_KEY }),
    [queryClient]
  );

  const fetchHostelCategories = useCallback(
    async (newFilters?: HostelCategoryFilters) => {
      if (newFilters) setFilters(newFilters);
      await invalidate();
    },
    [invalidate]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<HostelCategoryFilters>) => {
      setFilters((current) => ({ ...current, ...newFilters, page: 1 }));
    },
    []
  );

  const createHostelCategory = useCallback(
    async (dto: CreateHostelCategoryDto) => {
      const result = await HostelCategoryService.createCategory(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateHostelCategory = useCallback(
    async (id: string, dto: UpdateHostelCategoryDto) => {
      const result = await HostelCategoryService.updateCategory(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteHostelCategory = useCallback(
    async (id: string) => {
      await HostelCategoryService.deleteCategory(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    hostelCategories: query.data?.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    filters,
    metadata: query.data?.metadata ?? EMPTY_METADATA,
    fetchHostelCategories,
    updateFilters,
    createHostelCategory,
    updateHostelCategory,
    deleteHostelCategory,
  };
}

export function useActiveHostelCategories() {
  const query = useQuery({
    queryKey: [...HOSTEL_CATEGORIES_KEY, 'active'],
    queryFn: () => HostelCategoryService.getActiveCategories(),
  });

  return {
    hostelCategories: query.data ?? [],
    loading: query.isLoading,
  };
}
