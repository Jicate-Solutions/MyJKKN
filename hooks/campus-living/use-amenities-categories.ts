import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AmenitiesCategoryService } from '@/lib/services/campus-living/amenities-category-service';
import type {
  AmenitiesCategoryFilters,
  CreateAmenitiesCategoryDto,
  UpdateAmenitiesCategoryDto,
} from '@/types/amenities-categories';

// Shared React Query key. Every component that calls useAmenitiesCategories()
// subscribes to the SAME cache entry, so a mutation in the form dialog / row
// actions invalidates this key and the rendered data-table refetches — no
// page reload needed. (A plain useState hook gave each component an isolated
// state instance, so mutations only refreshed an orphan instance.)
const AMENITIES_CATEGORIES_KEY = ['campus-living', 'amenities-categories'] as const;

const EMPTY_METADATA = { total: 0, page: 1, limit: 100, totalPages: 0 };

export function useAmenitiesCategories(
  initialFilters: AmenitiesCategoryFilters = {}
) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AmenitiesCategoryFilters>(initialFilters);

  const query = useQuery({
    queryKey: [...AMENITIES_CATEGORIES_KEY, filters],
    queryFn: () => AmenitiesCategoryService.getCategories(filters),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: AMENITIES_CATEGORIES_KEY }),
    [queryClient]
  );

  const fetchAmenitiesCategories = useCallback(
    async (newFilters?: AmenitiesCategoryFilters) => {
      if (newFilters) setFilters(newFilters);
      await invalidate();
    },
    [invalidate]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<AmenitiesCategoryFilters>) => {
      setFilters((current) => ({ ...current, ...newFilters, page: 1 }));
    },
    []
  );

  const createAmenitiesCategory = useCallback(
    async (dto: CreateAmenitiesCategoryDto) => {
      const result = await AmenitiesCategoryService.createCategory(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateAmenitiesCategory = useCallback(
    async (id: string, dto: UpdateAmenitiesCategoryDto) => {
      const result = await AmenitiesCategoryService.updateCategory(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteAmenitiesCategory = useCallback(
    async (id: string) => {
      await AmenitiesCategoryService.deleteCategory(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    amenitiesCategories: query.data?.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    filters,
    metadata: query.data?.metadata ?? EMPTY_METADATA,
    fetchAmenitiesCategories,
    updateFilters,
    createAmenitiesCategory,
    updateAmenitiesCategory,
    deleteAmenitiesCategory,
  };
}

export function useActiveAmenitiesCategories() {
  const query = useQuery({
    queryKey: [...AMENITIES_CATEGORIES_KEY, 'active'],
    queryFn: () => AmenitiesCategoryService.getActiveCategories(),
  });

  return {
    amenitiesCategories: query.data ?? [],
    loading: query.isLoading,
  };
}
