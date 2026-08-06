// hooks/audit/use-carre-evidence.ts
// React Query hooks for the CARRE live-evidence RPC and the sealed participant
// lane (see lib/services/audit/carre-evidence-service.ts for the contract).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CarreEvidenceService } from '@/lib/services/audit/carre-evidence-service';

export const carreEvidenceKeys = {
  all: ['audit', 'carre-evidence'] as const,
  evidence: (cycleId: string) => [...carreEvidenceKeys.all, 'items', cycleId] as const,
  rollup: (cycleId: string) => [...carreEvidenceKeys.all, 'rollup', cycleId] as const,
  participantContext: (cycleId: string) =>
    [...carreEvidenceKeys.all, 'participant-context', cycleId] as const,
};

/** Live per-item evidence + doctrine caps (lead auditor / leadership only). */
export function useCarreItemEvidence(cycleId: string | undefined) {
  return useQuery({
    queryKey: carreEvidenceKeys.evidence(cycleId ?? ''),
    queryFn: () => CarreEvidenceService.getItemEvidence(cycleId!),
    enabled: !!cycleId,
    staleTime: 60 * 1000, // live evidence, but not per-keystroke live
  });
}

/** k≥3-floored sealed participant aggregates (leadership only). */
export function useCarreParticipantRollup(cycleId: string | undefined) {
  return useQuery({
    queryKey: carreEvidenceKeys.rollup(cycleId ?? ''),
    queryFn: () => CarreEvidenceService.getParticipantRollup(cycleId!),
    enabled: !!cycleId,
    staleTime: 60 * 1000,
  });
}

/** Learner context for the sealed scoring door. */
export function useCarreParticipantContext(cycleId: string | undefined) {
  return useQuery({
    queryKey: carreEvidenceKeys.participantContext(cycleId ?? ''),
    queryFn: () => CarreEvidenceService.getParticipantContext(cycleId!),
    enabled: !!cycleId,
  });
}

/** Learner sealed score submit (upserts the caller's own row). */
export function useSubmitCarreParticipantScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      cycleId: string;
      parameterCode: string;
      score: number;
      note?: string | null;
      lane: 'own' | 'observer';
    }) => CarreEvidenceService.submitParticipantScore(input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: carreEvidenceKeys.participantContext(vars.cycleId),
      });
      void qc.invalidateQueries({ queryKey: carreEvidenceKeys.rollup(vars.cycleId) });
    },
  });
}
