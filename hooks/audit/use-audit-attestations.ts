// hooks/audit/use-audit-attestations.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuditAttestationService } from '@/lib/services/audit';
import type { AuditAttestation, CosignAttestationDto, SignAttestationDto } from '@/lib/types/audit';

export const auditAttestationKeys = {
  all: ['audit', 'attestations'] as const,
  byCycle: (cycleId: string) => [...auditAttestationKeys.all, 'byCycle', cycleId] as const,
  rollup: (cycleId: string) => [...auditAttestationKeys.all, 'rollup', cycleId] as const,
};

export function useAttestationsByCycle(cycleId: string | undefined) {
  return useQuery({
    queryKey: auditAttestationKeys.byCycle(cycleId ?? ''),
    queryFn: () =>
      cycleId ? AuditAttestationService.list(cycleId) : Promise.resolve([]),
    enabled: !!cycleId,
    staleTime: 30 * 1000,
  });
}

export function useAttestationRollup(cycleId: string | undefined) {
  return useQuery({
    queryKey: auditAttestationKeys.rollup(cycleId ?? ''),
    queryFn: () =>
      cycleId
        ? AuditAttestationService.rollup(cycleId)
        : Promise.resolve({ total: 0, compliant: 0, partial: 0, non_compliant: 0, pending: 0 }),
    enabled: !!cycleId,
    staleTime: 30 * 1000,
  });
}

export function useSignAttestation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SignAttestationDto) => AuditAttestationService.sign(dto, { userId }),
    onSuccess: (data: AuditAttestation) => {
      qc.invalidateQueries({ queryKey: auditAttestationKeys.byCycle(data.audit_cycle_id) });
      qc.invalidateQueries({ queryKey: auditAttestationKeys.rollup(data.audit_cycle_id) });
    },
  });
}

export function useCosignAttestation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CosignAttestationDto) => AuditAttestationService.cosign(dto, { userId }),
    onSuccess: (data: AuditAttestation) => {
      qc.invalidateQueries({ queryKey: auditAttestationKeys.byCycle(data.audit_cycle_id) });
    },
  });
}
