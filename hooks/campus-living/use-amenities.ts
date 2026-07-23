import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AmenityService } from '@/lib/services/campus-living/amenity-service';
import type {
  AmenityFilters,
  CreateAmenityDto,
  UpdateAmenityDto,
} from '@/types/amenities';

// Shared React Query key. Every component that calls useAmenities()
// subscribes to the SAME cache entry, so a mutation in the form dialog /
// row actions invalidates this key and the rendered data-table refetches
// — no page reload needed. (Mirrors useAmenitiesCategories cache shape.)
const AMENITIES_KEY = ['campus-living', 'amenities'] as const;

const EMPTY_METADATA = { total: 0, page: 1, limit: 100, totalPages: 0 };

export function useAmenities(initialFilters: AmenityFilters = {}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AmenityFilters>(initialFilters);

  const query = useQuery({
    queryKey: [...AMENITIES_KEY, filters],
    queryFn: () => AmenityService.getAmenities(filters),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: AMENITIES_KEY }),
    [queryClient]
  );

  const fetchAmenities = useCallback(
    async (newFilters?: AmenityFilters) => {
      if (newFilters) setFilters(newFilters);
      await invalidate();
    },
    [invalidate]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<AmenityFilters>) => {
      setFilters((current) => ({ ...current, ...newFilters, page: 1 }));
    },
    []
  );

  const createAmenity = useCallback(
    async (dto: CreateAmenityDto) => {
      const result = await AmenityService.createAmenity(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateAmenity = useCallback(
    async (id: string, dto: UpdateAmenityDto) => {
      const result = await AmenityService.updateAmenity(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteAmenity = useCallback(
    async (id: string) => {
      await AmenityService.deleteAmenity(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    amenities: query.data?.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    filters,
    metadata: query.data?.metadata ?? EMPTY_METADATA,
    fetchAmenities,
    updateFilters,
    createAmenity,
    updateAmenity,
    deleteAmenity,
  };
}

export function useActiveAmenities() {
  const query = useQuery({
    queryKey: [...AMENITIES_KEY, 'active'],
    queryFn: () => AmenityService.getActiveAmenities(),
  });

  return {
    amenities: query.data ?? [],
    loading: query.isLoading,
  };
}

/**
 * Active amenities applicable to a given assignment scope (block | room).
 * Returns rows whose scope matches OR is 'both'. Powers the Block form
 * (scope='block') and Room form (scope='room') amenity pickers.
 */
export function useAmenitiesByScope(scope: 'block' | 'room') {
  const query = useQuery({
    queryKey: [...AMENITIES_KEY, 'by-scope', scope],
    queryFn: () => AmenityService.getAmenitiesByScope(scope),
  });

  return {
    amenities: query.data ?? [],
    loading: query.isLoading,
  };
}
