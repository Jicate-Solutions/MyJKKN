import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HostelYearService } from '@/lib/services/campus-living/hostel-year-service';
import type {
  HostelYearFilters,
  CreateHostelYearDto,
  UpdateHostelYearDto,
} from '@/types/hostel-years';

// Shared React Query key — all instances subscribe to one cache so a mutation
// in the form dialog / row actions refreshes the rendered table without a reload.
const HOSTEL_YEARS_KEY = ['campus-living', 'hostel-years'] as const;

const EMPTY_METADATA = { total: 0, page: 1, limit: 100, totalPages: 0 };

export function useHostelYears(initialFilters: HostelYearFilters = {}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<HostelYearFilters>(initialFilters);

  const query = useQuery({
    queryKey: [...HOSTEL_YEARS_KEY, filters],
    queryFn: () => HostelYearService.getYears(filters),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: HOSTEL_YEARS_KEY }),
    [queryClient]
  );

  const fetchHostelYears = useCallback(
    async (newFilters?: HostelYearFilters) => {
      if (newFilters) setFilters(newFilters);
      await invalidate();
    },
    [invalidate]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<HostelYearFilters>) => {
      setFilters((current) => ({ ...current, ...newFilters, page: 1 }));
    },
    []
  );

  const createHostelYear = useCallback(
    async (dto: CreateHostelYearDto) => {
      const result = await HostelYearService.createYear(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateHostelYear = useCallback(
    async (id: string, dto: UpdateHostelYearDto) => {
      const result = await HostelYearService.updateYear(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteHostelYear = useCallback(
    async (id: string) => {
      await HostelYearService.deleteYear(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    hostelYears: query.data?.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    filters,
    metadata: query.data?.metadata ?? EMPTY_METADATA,
    fetchHostelYears,
    updateFilters,
    createHostelYear,
    updateHostelYear,
    deleteHostelYear,
  };
}

export function useActiveHostelYears() {
  const query = useQuery({
    queryKey: [...HOSTEL_YEARS_KEY, 'active'],
    queryFn: () => HostelYearService.getActiveYears(),
  });
  return {
    hostelYears: query.data ?? [],
    loading: query.isLoading,
  };
}

export function useCurrentHostelYear() {
  const query = useQuery({
    queryKey: [...HOSTEL_YEARS_KEY, 'current'],
    queryFn: () => HostelYearService.getCurrentYear(),
  });
  return {
    currentYear: query.data ?? null,
    loading: query.isLoading,
  };
}
