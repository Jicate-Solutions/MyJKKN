import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BillableAmenityService } from '@/lib/services/campus-living/billable-amenity-service';
import type {
  BillableAmenityFilters,
  CreateBillableAmenityDto,
  UpdateBillableAmenityDto,
} from '@/types/billable-amenities';

// Shared React Query key. Mutations invalidate this key so all
// subscribers (data-table, dialogs, row actions) refetch without a
// page reload. Mirrors useAmenitiesCategories cache shape.
const BILLABLE_AMENITIES_KEY = ['campus-living', 'billable-amenities'] as const;

const EMPTY_METADATA = { total: 0, page: 1, limit: 100, totalPages: 0 };

export function useBillableAmenities(
  initialFilters: BillableAmenityFilters = {}
) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<BillableAmenityFilters>(initialFilters);

  const query = useQuery({
    queryKey: [...BILLABLE_AMENITIES_KEY, filters],
    queryFn: () => BillableAmenityService.getBillableAmenities(filters),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: BILLABLE_AMENITIES_KEY }),
    [queryClient]
  );

  const fetchBillableAmenities = useCallback(
    async (newFilters?: BillableAmenityFilters) => {
      if (newFilters) setFilters(newFilters);
      await invalidate();
    },
    [invalidate]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<BillableAmenityFilters>) => {
      setFilters((current) => ({ ...current, ...newFilters, page: 1 }));
    },
    []
  );

  const createBillableAmenity = useCallback(
    async (dto: CreateBillableAmenityDto) => {
      const result = await BillableAmenityService.createBillableAmenity(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateBillableAmenity = useCallback(
    async (id: string, dto: UpdateBillableAmenityDto) => {
      const result = await BillableAmenityService.updateBillableAmenity(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteBillableAmenity = useCallback(
    async (id: string) => {
      await BillableAmenityService.deleteBillableAmenity(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    billableAmenities: query.data?.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    filters,
    metadata: query.data?.metadata ?? EMPTY_METADATA,
    fetchBillableAmenities,
    updateFilters,
    createBillableAmenity,
    updateBillableAmenity,
    deleteBillableAmenity,
  };
}

export function useActiveBillableAmenities() {
  const query = useQuery({
    queryKey: [...BILLABLE_AMENITIES_KEY, 'active'],
    queryFn: () => BillableAmenityService.getActiveBillableAmenities(),
  });

  return {
    billableAmenities: query.data ?? [],
    loading: query.isLoading,
  };
}
