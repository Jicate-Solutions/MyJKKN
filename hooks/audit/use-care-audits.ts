// hooks/audit/use-care-audits.ts
// React Query hooks for the CARE audit flow (RPC-backed — see
// lib/services/audit/care-audit-service.ts for why everything is an RPC).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CareAuditService } from '@/lib/services/audit/care-audit-service';

export const careAuditKeys = {
  all: ['audit', 'care'] as const,
  list: () => [...careAuditKeys.all, 'list'] as const,
  detail: (cycleId: string) => [...careAuditKeys.all, 'detail', cycleId] as const,
  inviteContext: (token: string) => [...careAuditKeys.all, 'invite', token] as const,
};

export function useCareAudits() {
  return useQuery({
    queryKey: careAuditKeys.list(),
    queryFn: () => CareAuditService.listAudits(),
    staleTime: 30 * 1000,
  });
}

export function useCareAudit(cycleId: string | undefined) {
  return useQuery({
    queryKey: careAuditKeys.detail(cycleId ?? ''),
    queryFn: () => CareAuditService.getAudit(cycleId!),
    enabled: !!cycleId,
  });
}

export function useCreateCareAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; audience: string; reAuditDate: string }) =>
      CareAuditService.createAudit(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: careAuditKeys.list() }),
  });
}

export function useUpsertCareScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      cycleId: string;
      parameterCode: string;
      score: number;
      evidenceNote?: string | null;
    }) => CareAuditService.upsertScore(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: careAuditKeys.detail(vars.cycleId) });
      qc.invalidateQueries({ queryKey: careAuditKeys.list() });
    },
  });
}

export function useCreateCareInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { cycleId: string; invitedEmail?: string }) =>
      CareAuditService.createInvite(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: careAuditKeys.detail(vars.cycleId) });
    },
  });
}

export function useCareInviteContext(token: string | undefined) {
  return useQuery({
    queryKey: careAuditKeys.inviteContext(token ?? ''),
    queryFn: () => CareAuditService.getInviteContext(token!),
    enabled: !!token,
    retry: false, // denial reasons are terminal — don't hammer the RPC
  });
}

export function useSubmitParticipantScores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      token: string;
      scores: Array<{ parameter_code: string; score: number; evidence_note?: string | null }>;
    }) => CareAuditService.submitParticipantScores(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: careAuditKeys.inviteContext(vars.token) });
    },
  });
}
