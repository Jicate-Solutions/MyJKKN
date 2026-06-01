import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HostelCategoryFeeService } from '@/lib/services/campus-living/hostel-category-fee-service';
import type {
  CreateHostelCategoryFeeDto,
  UpdateHostelCategoryFeeDto,
} from '@/types/hostel-category-fees';

// Shared React Query key — all instances subscribe to one cache, so a
// create/edit/delete in the dialog refreshes the rendered table without a reload.
const HOSTEL_CATEGORY_FEES_KEY = ['campus-living', 'hostel-category-fees'] as const;

export function useHostelCategoryFees(hostelYearId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...HOSTEL_CATEGORY_FEES_KEY, hostelYearId],
    queryFn: () =>
      hostelYearId
        ? HostelCategoryFeeService.getFeesByYear(hostelYearId)
        : Promise.resolve([]),
    enabled: !!hostelYearId,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: HOSTEL_CATEGORY_FEES_KEY }),
    [queryClient]
  );

  const createFee = useCallback(
    async (dto: CreateHostelCategoryFeeDto) => {
      const result = await HostelCategoryFeeService.createFee(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateFee = useCallback(
    async (id: string, dto: UpdateHostelCategoryFeeDto) => {
      const result = await HostelCategoryFeeService.updateFee(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteFee = useCallback(
    async (id: string) => {
      await HostelCategoryFeeService.deleteFee(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    fees: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: invalidate,
    createFee,
    updateFee,
    deleteFee,
  };
}
