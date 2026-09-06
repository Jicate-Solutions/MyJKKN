import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HostelUpgradeFeeService } from '@/lib/services/campus-living/hostel-upgrade-fee-service';
import type {
  CreateUpgradeFeeDto,
  UpdateUpgradeFeeDto,
} from '@/types/hostel-category-upgrade-fees';

// Shared React Query key — table/dialog/row-actions subscribe to one cache so a
// create/edit/delete refreshes the rendered matrix without a reload.
const UPGRADE_FEES_KEY = ['campus-living', 'hostel-upgrade-fees'] as const;

export function useHostelUpgradeFees(hostelYearId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...UPGRADE_FEES_KEY, hostelYearId],
    queryFn: () =>
      hostelYearId
        ? HostelUpgradeFeeService.getByYear(hostelYearId)
        : Promise.resolve([]),
    enabled: !!hostelYearId,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: UPGRADE_FEES_KEY }),
    [queryClient]
  );

  const createFee = useCallback(
    async (dto: CreateUpgradeFeeDto) => {
      const result = await HostelUpgradeFeeService.create(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateFee = useCallback(
    async (id: string, dto: UpdateUpgradeFeeDto) => {
      const result = await HostelUpgradeFeeService.update(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteFee = useCallback(
    async (id: string) => {
      await HostelUpgradeFeeService.remove(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: invalidate,
    createFee,
    updateFee,
    deleteFee,
  };
}
