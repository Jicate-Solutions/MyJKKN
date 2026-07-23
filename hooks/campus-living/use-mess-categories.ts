import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessCategoryService } from '@/lib/services/campus-living/mess-category-service';
import type {
  MessCategoryFilters,
  CreateMessCategoryDto,
  UpdateMessCategoryDto,
} from '@/types/mess-categories';

// Shared React Query key. Every component that calls useMessCategories()
// subscribes to the SAME cache entry, so a mutation in the form dialog / row
// actions invalidates this key and the rendered data-table refetches — no
// page reload needed. (A plain useState hook gave each component an isolated
// state instance, so mutations only refreshed an orphan instance.)
const MESS_CATEGORIES_KEY = ['campus-living', 'mess-categories'] as const;

const EMPTY_METADATA = { total: 0, page: 1, limit: 100, totalPages: 0 };

export function useMessCategories(initialFilters: MessCategoryFilters = {}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<MessCategoryFilters>(initialFilters);

  const query = useQuery({
    queryKey: [...MESS_CATEGORIES_KEY, filters],
    queryFn: () => MessCategoryService.getCategories(filters),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: MESS_CATEGORIES_KEY }),
    [queryClient]
  );

  const fetchMessCategories = useCallback(
    async (newFilters?: MessCategoryFilters) => {
      if (newFilters) setFilters(newFilters);
      await invalidate();
    },
    [invalidate]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<MessCategoryFilters>) => {
      setFilters((current) => ({ ...current, ...newFilters, page: 1 }));
    },
    []
  );

  const createMessCategory = useCallback(
    async (dto: CreateMessCategoryDto) => {
      const result = await MessCategoryService.createCategory(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateMessCategory = useCallback(
    async (id: string, dto: UpdateMessCategoryDto) => {
      const result = await MessCategoryService.updateCategory(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteMessCategory = useCallback(
    async (id: string) => {
      await MessCategoryService.deleteCategory(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    messCategories: query.data?.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    filters,
    metadata: query.data?.metadata ?? EMPTY_METADATA,
    fetchMessCategories,
    updateFilters,
    createMessCategory,
    updateMessCategory,
    deleteMessCategory,
  };
}

export function useActiveMessCategories() {
  const query = useQuery({
    queryKey: [...MESS_CATEGORIES_KEY, 'active'],
    queryFn: () => MessCategoryService.getActiveCategories(),
  });

  return {
    messCategories: query.data ?? [],
    loading: query.isLoading,
  };
}
