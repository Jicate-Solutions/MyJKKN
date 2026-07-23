// hooks/audit/use-audit-parameter-results.ts
// React Query hooks wrapping AuditParameterResultsService — Gate ③ capture snapshot rows.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuditParameterResultsService } from '@/lib/services/audit/audit-parameter-results-service';
import type { AuditParameterResult } from '@/lib/types/audit';

export const auditParameterResultKeys = {
  all: ['audit', 'parameterResults'] as const,
  byCycle: (cycleId: string) => [...auditParameterResultKeys.all, 'byCycle', cycleId] as const,
  prior: (cycleId: string, parameterCode: string, institutionId: string | null) =>
    [...auditParameterResultKeys.all, 'prior', cycleId, parameterCode, institutionId ?? 'null'] as const,
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

/**
 * This college's last-cycle result for the (parameter × institution) pair about to
 * be filed against — the "how did we do here last time" context for the log-finding
 * dialog. Enabled only once all three keys are set. Returns null when the pair has
 * no prior-cycle result.
 */
export function usePriorParameterResult(
  cycleId?: string,
  parameterCode?: string,
  institutionId?: string | null
) {
  return useQuery({
    queryKey: auditParameterResultKeys.prior(cycleId ?? '', parameterCode ?? '', institutionId ?? null),
    queryFn: () =>
      cycleId && parameterCode
        ? AuditParameterResultsService.getPriorForPair(cycleId, parameterCode, institutionId ?? null)
        : Promise.resolve(null as AuditParameterResult | null),
    enabled: !!cycleId && !!parameterCode && !!institutionId,
    staleTime: 60 * 1000,
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
