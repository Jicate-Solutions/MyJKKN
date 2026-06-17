// hooks/use-session-feedback.ts
// React Query hooks for the post-class feedback module. Mirrors hooks/pde/use-pde.ts.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';
import type { SubmitFeedbackInput } from '@/types/session-feedback';

export const scfQueryKeys = {
  all: ['session-feedback'] as const,
  checklistConfig: (institutionId?: string | null) =>
    [...scfQueryKeys.all, 'checklist-config', institutionId ?? null] as const,
  pending: (lookbackDays: number) => [...scfQueryKeys.all, 'pending', lookbackDays] as const,
  confirmation: (from: string, to: string) =>
    [...scfQueryKeys.all, 'confirmation', from, to] as const,
  facultySummary: (from: string, to: string) =>
    [...scfQueryKeys.all, 'faculty-summary', from, to] as const,
  facultyCompletion: (from: string, to: string) =>
    [...scfQueryKeys.all, 'faculty-completion', from, to] as const,
  pendingRoster: (date: string, timetableId: string, periodId: string) =>
    [...scfQueryKeys.all, 'pending-roster', date, timetableId, periodId] as const,
  escalations: (from: string, to: string) =>
    [...scfQueryKeys.all, 'escalations', from, to] as const,
  escalationFollowups: (from: string, to: string) =>
    [...scfQueryKeys.all, 'escalation-followups', from, to] as const,
};

export function useChecklistConfig(institutionId?: string | null) {
  return useQuery({
    queryKey: scfQueryKeys.checklistConfig(institutionId),
    queryFn: () => SessionFeedbackService.getChecklistConfig(institutionId),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePendingSessions(lookbackDays = 30) {
  return useQuery({
    queryKey: scfQueryKeys.pending(lookbackDays),
    queryFn: () => SessionFeedbackService.getPending(lookbackDays),
    staleTime: 30 * 1000,
  });
}

export function useConfirmationStatus(from: string, to: string) {
  return useQuery({
    queryKey: scfQueryKeys.confirmation(from, to),
    queryFn: () => SessionFeedbackService.getConfirmationStatus(from, to),
    enabled: !!from && !!to,
    staleTime: 30 * 1000,
  });
}

export function useFacultyFeedbackSummary(from: string, to: string) {
  return useQuery({
    queryKey: scfQueryKeys.facultySummary(from, to),
    queryFn: () => SessionFeedbackService.getFacultySummary(from, to),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}

/** Per-session feedback completion (confirmed/present %) for the caller faculty. */
export function useFacultyCompletion(from: string, to: string) {
  return useQuery({
    queryKey: scfQueryKeys.facultyCompletion(from, to),
    queryFn: () => SessionFeedbackService.getFacultyCompletion(from, to),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}

/** Names of Present students who haven't submitted for ONE session (identity only).
 *  Lazy: only fetches when `enabled` (e.g. when the faculty opens the pending drawer). */
export function useSessionPendingRoster(
  date: string,
  timetableId: string,
  periodId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: scfQueryKeys.pendingRoster(date, timetableId, periodId),
    queryFn: () => SessionFeedbackService.getPendingRoster(date, timetableId, periodId),
    enabled: enabled && !!date && !!timetableId && !!periodId,
    staleTime: 30 * 1000,
  });
}

export function useEscalations(from: string, to: string) {
  return useQuery({
    queryKey: scfQueryKeys.escalations(from, to),
    queryFn: () => SessionFeedbackService.getEscalations(from, to),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}

/** Escalated sessions paired with their next same-faculty+course session + lift. */
export function useEscalationFollowups(from: string, to: string) {
  return useQuery({
    queryKey: scfQueryKeys.escalationFollowups(from, to),
    queryFn: () => SessionFeedbackService.getEscalationFollowups(from, to),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}

/** Submit feedback; refreshes the pending + confirmation views on success. */
export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitFeedbackInput) => SessionFeedbackService.submitFeedback(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scfQueryKeys.all });
    },
  });
}
