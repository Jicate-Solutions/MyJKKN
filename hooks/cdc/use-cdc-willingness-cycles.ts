'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CdcDrive,
  CdcWillingnessCycle,
  CdcWillingnessCycleReopenPayload,
  CdcWillingnessCyclesResponse,
  CdcWillingnessCycleUpdatePayload,
} from '@/types/cdc';
import type { CycleDispatchResult } from '@/lib/services/cdc/willingness-cycles';

const BASE = '/api/cdc/drives';

export function useCdcWillingnessCycles(driveId: string | undefined) {
  return useQuery({
    queryKey: ['cdc-willingness-cycles', driveId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/${driveId}/willingness-cycles`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Willingness cycles failed: ${res.status}`);
      }
      return (await res.json()) as CdcWillingnessCyclesResponse;
    },
    enabled: !!driveId,
  });
}

export interface CdcWillingnessCycleMutationResult {
  cycle: CdcWillingnessCycle;
  drive: CdcDrive;
  dispatched: CycleDispatchResult[];
}

export function useCdcWillingnessCycleMutation(driveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CdcWillingnessCycleUpdatePayload | CdcWillingnessCycleReopenPayload) => {
      const res = await fetch(`${BASE}/${driveId}/willingness-cycles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Could not save willingness settings');
      }
      return (await res.json()) as CdcWillingnessCycleMutationResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cdc-willingness-cycles', driveId] });
      qc.invalidateQueries({ queryKey: ['cdc-drive', driveId] });
      qc.invalidateQueries({ queryKey: ['cdc-drives'] });
      qc.invalidateQueries({ queryKey: ['cdc-drive-notifications', driveId] });
      qc.invalidateQueries({ queryKey: ['cdc-drive-assigned', driveId] });
    },
  });
}
