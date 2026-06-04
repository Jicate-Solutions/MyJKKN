import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HostelFeeService } from '@/lib/services/campus-living/hostel-fee-service';
import type {
  CreateHostelFeeDto,
  UpdateHostelFeeDto,
} from '@/types/hostel-fees';

// Shared React Query key — all instances subscribe to one cache, so a
// create/edit/delete in any fee dialog refreshes the rendered tables without a reload.
const HOSTEL_FEES_KEY = ['campus-living', 'hostel-fees'] as const;

export function useHostelFees(hostelYearId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...HOSTEL_FEES_KEY, hostelYearId],
    queryFn: () =>
      hostelYearId
        ? HostelFeeService.getFeesByYear(hostelYearId)
        : Promise.resolve([]),
    enabled: !!hostelYearId,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: HOSTEL_FEES_KEY }),
    [queryClient]
  );

  const createFee = useCallback(
    async (dto: CreateHostelFeeDto) => {
      const result = await HostelFeeService.createFee(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateFee = useCallback(
    async (id: string, dto: UpdateHostelFeeDto) => {
      const result = await HostelFeeService.updateFee(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteFee = useCallback(
    async (id: string) => {
      await HostelFeeService.deleteFee(id);
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

// All package fees across every hostel year — for the Package Fees section,
// which shows a Hostel Year column instead of filtering by a single year.
// Shares the HOSTEL_FEES_KEY prefix, so a create/edit via useHostelFees(year)
// invalidates this list too.
export function usePackageFees() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...HOSTEL_FEES_KEY, 'packages'],
    queryFn: () => HostelFeeService.getPackageFees(),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: HOSTEL_FEES_KEY }),
    [queryClient]
  );

  const deleteFee = useCallback(
    async (id: string) => {
      await HostelFeeService.deleteFee(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    fees: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    deleteFee,
  };
}
