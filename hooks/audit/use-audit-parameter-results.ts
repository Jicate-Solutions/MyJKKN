// hooks/audit/use-audit-parameter-results.ts
// React Query hooks wrapping AuditParameterResultsService — Gate ③ capture snapshot rows.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuditParameterResultsService } from '@/lib/services/audit/audit-parameter-results-service';
import type { AuditParameterResult } from '@/lib/types/audit';

export const auditParameterResultKeys = {
  all: ['audit', 'parameterResults'] as const,
  byCycle: (cycleId: string) => [...auditParameterResultKeys.all, 'byCycle', cycleId] as const,
};

export function useParameterResults(cycleId?: string) {
  return useQuery({
    queryKey: auditParameterResultKeys.byCycle(cycleId ?? ''),
    queryFn: () =>
      cycleId
        ? AuditParameterResultsService.listByCycle(cycleId)
        : Promise.resolve([] as AuditParameterResult[]),
    enabled: !!cycleId,
    staleTime: 30 * 1000,
  });
}

export function useCaptureCycleResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cycleId: string) => AuditParameterResultsService.capture(cycleId),
    onSuccess: (_rowsWritten: number, cycleId: string) => {
      qc.invalidateQueries({ queryKey: auditParameterResultKeys.byCycle(cycleId) });
    },
  });
}
