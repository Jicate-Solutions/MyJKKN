'use client';

/**
 * HR Recruitment Need Signal — React Query Hooks
 *
 * Wraps RecruitmentNeedSignalService with React Query caching.
 * Decision F1.3: staleTime = 1 hour (3600000ms) for signal cache.
 * Force-refresh mutation recomputes via orchestrator RPC.
 *
 * Pattern: hooks/hr/use-hr-dashboard.ts (direct supabase client via createClientSupabaseClient)
 * Spec: specs/hr-recruitment-need-signal-2026-05-24.md
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { RecruitmentNeedSignalService } from '@/lib/services/hr/recruitment-need/signal-service';
import type {
  ComputeSignalParams,
  SignalFilters,
  HRRecruitmentSignalSuppressionInsert,
  HRRecruitmentEscalationInsert,
  HRRecruitmentEscalationUpdate,
  HRRecruitmentSignalSnapshotInsert,
  SignalInputKey,
} from '@/types/hr-recruitment-need';

const SIGNAL_STALE_TIME = 3_600_000; // 1 hour (Decision F1.3)

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const signalKeys = {
  all: ['hr-recruitment-signal'] as const,
  cache: (filters: SignalFilters) => [...signalKeys.all, 'cache', filters] as const,
  single: (institutionId: string, programId?: string | null) =>
    [...signalKeys.all, 'single', institutionId, programId ?? 'all'] as const,
  inputs: () => [...signalKeys.all, 'inputs'] as const,
  input: (key: SignalInputKey, params: ComputeSignalParams) =>
    [...signalKeys.all, 'input', key, params] as const,
  suppressions: (institutionId?: string) =>
    [...signalKeys.all, 'suppressions', institutionId ?? 'all'] as const,
  escalations: (institutionId?: string, status?: string) =>
    [...signalKeys.all, 'escalations', institutionId ?? 'all', status ?? 'all'] as const,
  snapshots: (institutionId?: string) =>
    [...signalKeys.all, 'snapshots', institutionId ?? 'all'] as const,
  lastVisit: () => [...signalKeys.all, 'last-visit'] as const,
};

// ─── Signal Cache Queries ───────────────────────────────────────────────────────

export function useRecruitmentSignals(filters: SignalFilters = {}) {
  return useQuery({
    queryKey: signalKeys.cache(filters),
    queryFn: () => RecruitmentNeedSignalService.getCachedSignals(getSupabase(), filters),
    staleTime: SIGNAL_STALE_TIME,
  });
}

export function useRecruitmentSignal(institutionId: string, programId?: string | null) {
  return useQuery({
    queryKey: signalKeys.single(institutionId, programId),
    queryFn: () =>
      RecruitmentNeedSignalService.getCachedSignal(getSupabase(), institutionId, programId),
    staleTime: SIGNAL_STALE_TIME,
    enabled: !!institutionId,
  });
}

// ─── Force Refresh (recompute) ──────────────────────────────────────────────────

export function useComputeSignal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: ComputeSignalParams) =>
      RecruitmentNeedSignalService.computeSignal(getSupabase(), params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signalKeys.all });
    },
  });
}

// ─── Individual Input Computation ───────────────────────────────────────────────

export function useSignalInput(
  inputKey: SignalInputKey,
  params: ComputeSignalParams,
  enabled = true
) {
  return useQuery({
    queryKey: signalKeys.input(inputKey, params),
    queryFn: () => RecruitmentNeedSignalService.computeInput(getSupabase(), inputKey, params),
    staleTime: SIGNAL_STALE_TIME,
    enabled: enabled && !!params.institution_id,
  });
}

// ─── Signal Inputs Registry ─────────────────────────────────────────────────────

export function useSignalInputs() {
  return useQuery({
    queryKey: signalKeys.inputs(),
    queryFn: () => RecruitmentNeedSignalService.listSignalInputs(getSupabase()),
    staleTime: Infinity,
  });
}

// ─── Suppressions ───────────────────────────────────────────────────────────────

export function useSuppressions(institutionId?: string) {
  return useQuery({
    queryKey: signalKeys.suppressions(institutionId),
    queryFn: () => RecruitmentNeedSignalService.listSuppressions(getSupabase(), institutionId),
  });
}

export function useCreateSuppression() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (insert: HRRecruitmentSignalSuppressionInsert) =>
      RecruitmentNeedSignalService.createSuppression(getSupabase(), insert),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signalKeys.suppressions() });
    },
  });
}

export function useUnsnoozeSuppression() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      RecruitmentNeedSignalService.unsnoozeSuppression(getSupabase(), id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signalKeys.suppressions() });
      queryClient.invalidateQueries({ queryKey: signalKeys.all });
    },
  });
}

// ─── Escalations ────────────────────────────────────────────────────────────────

export function useEscalations(institutionId?: string, statusFilter?: string) {
  return useQuery({
    queryKey: signalKeys.escalations(institutionId, statusFilter),
    queryFn: () =>
      RecruitmentNeedSignalService.listEscalations(getSupabase(), institutionId, statusFilter),
  });
}

export function useCreateEscalation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (insert: HRRecruitmentEscalationInsert) =>
      RecruitmentNeedSignalService.createEscalation(getSupabase(), insert),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signalKeys.escalations() });
    },
  });
}

export function useUpdateEscalation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: HRRecruitmentEscalationUpdate }) =>
      RecruitmentNeedSignalService.updateEscalation(getSupabase(), id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signalKeys.escalations() });
    },
  });
}

// ─── Snapshots ──────────────────────────────────────────────────────────────────

export function useSnapshots(institutionId?: string) {
  return useQuery({
    queryKey: signalKeys.snapshots(institutionId),
    queryFn: () => RecruitmentNeedSignalService.listSnapshots(getSupabase(), institutionId),
  });
}

export function useCreateSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (insert: HRRecruitmentSignalSnapshotInsert) =>
      RecruitmentNeedSignalService.createSnapshot(getSupabase(), insert),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signalKeys.snapshots() });
    },
  });
}

// ─── User Visit Tracking ────────────────────────────────────────────────────────

export function useLastVisit() {
  return useQuery({
    queryKey: signalKeys.lastVisit(),
    queryFn: () => RecruitmentNeedSignalService.getLastVisit(getSupabase()),
  });
}

export function useRecordVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (signalsAtVisit?: Record<string, unknown>) =>
      RecruitmentNeedSignalService.recordVisit(getSupabase(), signalsAtVisit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signalKeys.lastVisit() });
    },
  });
}
