// hooks/audit/use-carre-audits.ts
// React Query hooks for the CARRE (v2.0) audit flow (RPC-backed — see
// lib/services/audit/carre-audit-service.ts for why everything is an RPC).
//
// Parallel to use-care-audits.ts (CARE v1.0). The participant-scorer path is
// framework-agnostic and is served by the CARE participant hooks
// (useCareInviteContext / useSubmitParticipantScores) — no CARRE duplicate.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingCode } from '@/lib/services/audit/carre-scoring-service';
import { CarreAuditService } from '@/lib/services/audit/carre-audit-service';

export const carreAuditKeys = {
  all: ['audit', 'carre'] as const,
  list: () => [...carreAuditKeys.all, 'list'] as const,
  detail: (cycleId: string) => [...carreAuditKeys.all, 'detail', cycleId] as const,
};

export function useCarreAudits() {
  return useQuery({
    queryKey: carreAuditKeys.list(),
    queryFn: () => CarreAuditService.listAudits(),
    staleTime: 30 * 1000,
  });
}

export function useCarreAudit(cycleId: string | undefined) {
  return useQuery({
    queryKey: carreAuditKeys.detail(cycleId ?? ''),
    queryFn: () => CarreAuditService.getAudit(cycleId!),
    enabled: !!cycleId,
  });
}

export function useCreateCarreAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      audience: string;
      settingCode: SettingCode;
      reAuditDate: string;
    }) => CarreAuditService.createAudit(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: carreAuditKeys.list() }),
  });
}

/** Opens a 13-item Classroom Practice cycle (the per-Senior-Learner catalog). */
export function useCreateClassroomAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      teacherId?: string | null;
      reAuditDate?: string | null;
    }) => CarreAuditService.createClassroomAudit(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: carreAuditKeys.list() }),
  });
}

/**
 * Teacher-side compare (own score vs sealed learner median). Re-fetched when a
 * self-score lands, since the 13th one is what releases the reveal.
 */
export function useClassroomCompare(cycleId: string | undefined) {
  return useQuery({
    queryKey: [...carreAuditKeys.all, 'compare', cycleId ?? ''] as const,
    queryFn: () => CarreAuditService.getClassroomCompare(cycleId!),
    enabled: !!cycleId,
    staleTime: 60 * 1000,
  });
}

/**
 * Sealed learner comments — Principal & Director only, batch-revealed on the
 * same completed window as the scores. `enabled` should already exclude the
 * cycle owner (the server refuses them anyway); a locked result renders nothing.
 */
export function useClassroomSealedComments(cycleId: string | undefined) {
  return useQuery({
    queryKey: [...carreAuditKeys.all, 'sealed-comments', cycleId ?? ''] as const,
    queryFn: () => CarreAuditService.getClassroomSealedComments(cycleId!),
    enabled: !!cycleId,
    staleTime: 60 * 1000,
    retry: false,
  });
}

/** Type-ahead over team members for the Classroom Practice form. */
export function useTeacherSearch(q: string) {
  return useQuery({
    queryKey: [...carreAuditKeys.all, 'senior-learner-search', q] as const,
    queryFn: () => CarreAuditService.searchTeachers(q),
    enabled: q.trim().length >= 2,
    staleTime: 60 * 1000,
  });
}

export function useUpsertCarreScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      cycleId: string;
      parameterCode: string;
      score: number;
      evidenceNote?: string | null;
    }) => CarreAuditService.upsertScore(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: carreAuditKeys.detail(vars.cycleId) });
      qc.invalidateQueries({ queryKey: carreAuditKeys.list() });
      // The last self-score is what unlocks the compare — refresh it.
      qc.invalidateQueries({ queryKey: [...carreAuditKeys.all, 'compare', vars.cycleId] });
    },
  });
}

export function useCreateCarreInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { cycleId: string; invitedEmail?: string }) =>
      CarreAuditService.createInvite(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: carreAuditKeys.detail(vars.cycleId) });
    },
  });
}
