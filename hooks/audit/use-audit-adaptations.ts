// hooks/audit/use-audit-adaptations.ts
// React Query hooks wrapping AuditAdaptationsService — Gate ④ (adapt) recommendations.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuditAdaptationsService } from '@/lib/services/audit/audit-adaptations-service';
import type { AuditAdaptation } from '@/lib/types/audit';

export const auditAdaptationKeys = {
  all: ['audit', 'adaptations'] as const,
  byCycle: (cycleId: string) => [...auditAdaptationKeys.all, 'byCycle', cycleId] as const,
};

export function useAdaptations(cycleId?: string) {
  return useQuery({
    queryKey: auditAdaptationKeys.byCycle(cycleId ?? ''),
    queryFn: () =>
      cycleId
        ? AuditAdaptationsService.listByCycle(cycleId)
        : Promise.resolve([] as AuditAdaptation[]),
    enabled: !!cycleId,
    staleTime: 30 * 1000,
  });
}

export function useComputeAdaptations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cycleId: string) => AuditAdaptationsService.compute(cycleId),
    onSuccess: (_count: number, cycleId: string) => {
      qc.invalidateQueries({ queryKey: auditAdaptationKeys.byCycle(cycleId) });
    },
  });
}

export function useApplyAdaptation(cycleId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      AuditAdaptationsService.apply(id, note),
    onSuccess: () => {
      if (cycleId) qc.invalidateQueries({ queryKey: auditAdaptationKeys.byCycle(cycleId) });
    },
  });
}

export function useDismissAdaptation(cycleId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      AuditAdaptationsService.dismiss(id, note),
    onSuccess: () => {
      if (cycleId) qc.invalidateQueries({ queryKey: auditAdaptationKeys.byCycle(cycleId) });
    },
  });
}
