// hooks/audit/use-audit-findings.ts
// React Query hooks wrapping AuditFindingService — findings are service_requests of type audit_finding

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuditFindingService } from '@/lib/services/audit';
import type {
  AuditFindingFormData,
  AuditFindingView,
  FindingSeverity,
  LogAuditFindingDto,
} from '@/lib/types/audit';

export const auditFindingKeys = {
  all: ['audit', 'findings'] as const,
  byCycle: (cycleId: string, severity?: FindingSeverity, status?: string) =>
    [...auditFindingKeys.all, 'byCycle', cycleId, severity ?? '', status ?? ''] as const,
  my: (userId: string) => [...auditFindingKeys.all, 'my', userId] as const,
  detail: (id: string) => [...auditFindingKeys.all, 'detail', id] as const,
};

export function useFindingsByCycle(
  cycleId: string | undefined,
  filters: { severity?: FindingSeverity; status?: string } = {}
) {
  return useQuery({
    queryKey: auditFindingKeys.byCycle(cycleId ?? '', filters.severity, filters.status),
    queryFn: () =>
      cycleId
        ? AuditFindingService.listByCycle(cycleId, filters)
        : Promise.resolve([]),
    enabled: !!cycleId,
    staleTime: 30 * 1000,
  });
}

export function useMyFindings(userId: string | undefined) {
  return useQuery({
    queryKey: auditFindingKeys.my(userId ?? ''),
    queryFn: () => (userId ? AuditFindingService.listMyFindings(userId) : Promise.resolve([])),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
}

export function useFinding(id: string | undefined) {
  return useQuery({
    queryKey: auditFindingKeys.detail(id ?? ''),
    queryFn: () => (id ? AuditFindingService.get(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useLogFinding(requesterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: LogAuditFindingDto) => AuditFindingService.log(dto, { requesterId }),
    onSuccess: (data: AuditFindingView) => {
      qc.invalidateQueries({ queryKey: auditFindingKeys.all });
      qc.invalidateQueries({ queryKey: auditFindingKeys.byCycle(data.audit_cycle_id) });
    },
  });
}

export function useCloseFinding(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      evidenceUploaded,
      notes,
    }: {
      findingId: string;
      evidenceUploaded: NonNullable<AuditFindingFormData['evidence_uploaded']>;
      notes?: string;
    }) =>
      AuditFindingService.closeAsRectified(findingId, {
        evidenceUploaded,
        notes,
        userId,
      }),
    onSuccess: (data: AuditFindingView) => {
      qc.invalidateQueries({ queryKey: auditFindingKeys.detail(data.finding_id) });
      qc.invalidateQueries({ queryKey: auditFindingKeys.all });
    },
  });
}

export function useReopenFinding(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, reason }: { findingId: string; reason: string }) =>
      AuditFindingService.reopen(findingId, { reason, userId }),
    onSuccess: (data: AuditFindingView) => {
      qc.invalidateQueries({ queryKey: auditFindingKeys.detail(data.finding_id) });
      qc.invalidateQueries({ queryKey: auditFindingKeys.all });
    },
  });
}
