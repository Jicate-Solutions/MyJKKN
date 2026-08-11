'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AllocationBatchService } from '@/lib/services/campus-living/allocation-batch-service';

const KEY = ['campus-living', 'allocation-batches'] as const;

export function useAllocationBatches(institutionId?: string) {
  return useQuery({
    queryKey: [...KEY, 'list', institutionId ?? null],
    queryFn: () => AllocationBatchService.getBatches(institutionId),
  });
}

export function useAllocationBatch(batchId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', batchId],
    queryFn: () => AllocationBatchService.getBatch(batchId!),
    enabled: !!batchId,
  });
}

// Per-allocation eligibility explanation — fetched lazily when the details modal opens.
export function useAllocationExplain(allocationId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'explain', allocationId],
    queryFn: () => AllocationBatchService.explainAllocation(allocationId!),
    enabled: !!allocationId,
  });
}

export function useAutoCategories() {
  const query = useQuery({
    queryKey: [...KEY, 'auto-categories'],
    queryFn: () => AllocationBatchService.getAutoCategories(),
  });
  return { categories: query.data ?? [], loading: query.isLoading };
}

export function useAutoBlocks() {
  const query = useQuery({
    queryKey: [...KEY, 'auto-blocks'],
    queryFn: () => AllocationBatchService.getBlocks(),
  });
  return { blocks: query.data ?? [], loading: query.isLoading };
}

// Institutions housed by any block of this hostel type — scopes the Institution
// cohort filter on the auto-allocate page.
export function useHostelTypeInstitutions(hostelType: string) {
  const query = useQuery({
    queryKey: [...KEY, 'hostel-type-institutions', hostelType],
    queryFn: () => AllocationBatchService.getInstitutionsByHostelType(hostelType),
    enabled: !!hostelType,
  });
  return { institutions: query.data ?? [], loading: query.isLoading };
}

export function useHostelYears() {
  const query = useQuery({
    queryKey: [...KEY, 'hostel-years'],
    queryFn: () => AllocationBatchService.getHostelYears(),
  });
  return { years: query.data ?? [], loading: query.isLoading };
}

// Mutations (manual invalidation; these are infrequent admin/warden actions).
export function useAllocationBatchActions() {
  const qc = useQueryClient();
  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: KEY }),
    [qc]
  );

  const generate = useCallback(
    async (
      hostelType: string,
      strict = true,
      institutionId: string | null = null,
      programId: string | null = null,
      semesterId: string | null = null,
      allowOverflow = true,
    ) => {
      const id = await AllocationBatchService.generate(
        hostelType, strict, institutionId, programId, semesterId, allowOverflow,
      );
      await invalidate();
      return id;
    },
    [invalidate]
  );
  const approve = useCallback(
    async (batchId: string) => {
      await AllocationBatchService.approve(batchId);
      await invalidate();
    },
    [invalidate]
  );
  const reject = useCallback(
    async (batchId: string) => {
      await AllocationBatchService.reject(batchId);
      await invalidate();
    },
    [invalidate]
  );
  const reset = useCallback(
    async (batchId: string) => {
      await AllocationBatchService.reset(batchId);
      await invalidate();
    },
    [invalidate]
  );
  // Bulk reset for the Batches list. Runs sequentially and COLLECTS failures
  // instead of aborting on the first one — fn_reset_allocation_batch refuses
  // (P0001) any batch whose allocations carry a deposit record, so one bad
  // batch must not strand the rest. Invalidates once at the end so the table
  // doesn't refetch (and rows don't vanish) mid-loop.
  const resetMany = useCallback(
    async (batchIds: string[]): Promise<{ id: string; message: string }[]> => {
      const failed: { id: string; message: string }[] = [];
      for (const batchId of batchIds) {
        try {
          await AllocationBatchService.reset(batchId);
        } catch (e) {
          failed.push({
            id: batchId,
            message: e instanceof Error ? e.message : 'Failed to reset batch',
          });
        }
      }
      await invalidate();
      return failed;
    },
    [invalidate]
  );
  const removeAllocations = useCallback(
    async (batchId: string, allocationIds: string[]) => {
      await AllocationBatchService.removeAllocations(batchId, allocationIds);
      await invalidate();
    },
    [invalidate]
  );

  return { generate, approve, reject, reset, resetMany, removeAllocations };
}
