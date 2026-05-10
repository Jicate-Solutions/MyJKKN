'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImsStockAdjustmentService } from '@/lib/services/ims/stock-adjustment-service';
import type { CreateImsStockAdjustmentDto } from '@/types/ims';

// ─── Adjustments List ────────────────────────────────────

export function useImsAdjustments(
  storeId: string | null,
  institutionId?: string,
  filters?: { adjustment_type?: string; page?: number; limit?: number }
) {
  return useQuery({
    queryKey: ['ims-stock-adjustments', storeId, institutionId, filters],
    queryFn: () =>
      ImsStockAdjustmentService.getAdjustments({
        store_id: storeId || '',
        institution_id: institutionId,
        adjustment_type: filters?.adjustment_type,
        page: filters?.page,
        limit: filters?.limit,
      }),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Create Adjustment ──────────────────────────────────

export function useCreateImsAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateImsStockAdjustmentDto; userId: string }) =>
      ImsStockAdjustmentService.createAdjustment(data, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-stock-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
    },
  });
}

// ─── Adjustment Summary ─────────────────────────────────

export function useImsAdjustmentSummary(
  storeId: string | null,
  institutionId?: string
) {
  return useQuery({
    queryKey: ['ims-adjustment-summary', storeId, institutionId],
    queryFn: () =>
      ImsStockAdjustmentService.getAdjustmentSummary(storeId!, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}
