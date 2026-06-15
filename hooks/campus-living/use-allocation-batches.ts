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
    async (blockId: string, hostelYearId: string, strict = false) => {
      const id = await AllocationBatchService.generate(blockId, hostelYearId, strict);
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

  return { generate, approve, reject, reset };
}
