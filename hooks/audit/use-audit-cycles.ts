// hooks/audit/use-audit-cycles.ts
// React Query hooks for audit_cycles CRUD + phase transitions.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuditCycleService } from '@/lib/services/audit';
import type { AuditCyclePhase, CreateAuditCycleDto } from '@/lib/types/audit';

export const auditCycleKeys = {
  all: ['audit', 'cycles'] as const,
  lists: () => [...auditCycleKeys.all, 'list'] as const,
  list: (includeClosed = false) => [...auditCycleKeys.lists(), includeClosed] as const,
  detail: (id: string) => [...auditCycleKeys.all, 'detail', id] as const,
};

export function useAuditCycles(options: { includeClosed?: boolean } = {}) {
  return useQuery({
    queryKey: auditCycleKeys.list(options.includeClosed ?? false),
    queryFn: () => AuditCycleService.list(options),
    staleTime: 30 * 1000,
  });
}

export function useAuditCycle(id: string | undefined) {
  return useQuery({
    queryKey: auditCycleKeys.detail(id ?? ''),
    queryFn: () => (id ? AuditCycleService.get(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useCreateAuditCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAuditCycleDto) => AuditCycleService.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: auditCycleKeys.lists() }),
  });
}

export function useTransitionCyclePhase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, phase }: { id: string; phase: AuditCyclePhase }) =>
      AuditCycleService.transitionPhase(id, phase),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: auditCycleKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: auditCycleKeys.lists() });
    },
  });
}

export function useDeleteDraftCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AuditCycleService.deleteDraft(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: auditCycleKeys.lists() }),
  });
}
