// hooks/use-session-feedback.ts
// React Query hooks for the post-class feedback module. Mirrors hooks/pde/use-pde.ts.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';
import type {
  SubmitFeedbackInput,
  PostSessionResourceInput,
  ClarificationOutcome,
} from '@/types/session-feedback';

export const scfQueryKeys = {
  all: ['session-feedback'] as const,
  checklistConfig: (institutionId?: string | null) =>
    [...scfQueryKeys.all, 'checklist-config', institutionId ?? null] as const,
  pending: (lookbackDays: number) => [...scfQueryKeys.all, 'pending', lookbackDays] as const,
  carryforward: (lookbackDays: number) =>
    [...scfQueryKeys.all, 'carryforward', lookbackDays] as const,
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
  facultyFollowups: (from: string, to: string) =>
    [...scfQueryKeys.all, 'faculty-followups', from, to] as const,
  myImpact: (from: string, to: string) =>
    [...scfQueryKeys.all, 'my-impact', from, to] as const,
  adminCollegeSummary: (from: string, to: string) =>
    [...scfQueryKeys.all, 'admin-college-summary', from, to] as const,
  adminFacultySummary: (from: string, to: string) =>
    [...scfQueryKeys.all, 'admin-faculty-summary', from, to] as const,
  adminTrend: (from: string, to: string) =>
    [...scfQueryKeys.all, 'admin-trend', from, to] as const,
  facilitatorCoverage: (from: string, to: string) =>
    [...scfQueryKeys.all, 'facilitator-coverage', from, to] as const,
  openPulsesForLearner: () => [...scfQueryKeys.all, 'open-pulses-learner'] as const,
  pulseTotals: (pulseId: string) => [...scfQueryKeys.all, 'pulse-totals', pulseId] as const,
  myConfirmedAttendance: () => [...scfQueryKeys.all, 'my-confirmed-attendance'] as const,
  windowHours: () => [...scfQueryKeys.all, 'window-hours'] as const,
  resourcesForSession: (timetableId: string, attendanceDate: string, periodId: string) =>
    [...scfQueryKeys.all, 'resources-for-session', timetableId, attendanceDate, periodId] as const,
  clarification: (attendanceDate: string, periodId: string) =>
    [...scfQueryKeys.all, 'clarification', attendanceDate, periodId] as const,
};

/** Shared feedback-window length (hours) — the session_feedback.window_hours
 *  config lever behind the two-sided 48h window. UX hint only; the submit RPC
 *  enforces the close server-side. */
export function useFeedbackWindowHours() {
  return useQuery({
    queryKey: scfQueryKeys.windowHours(),
    queryFn: () => SessionFeedbackService.getFeedbackWindowHours(),
    staleTime: 5 * 60 * 1000,
  });
}

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
    // 2026-07-31: 30s staleTime re-fired this heavy RPC on every tab refocus,
    // multiplying peak-hour load (52k+ calls). Submit paths invalidate the
    // query explicitly, so a longer staleTime costs no post-submit freshness.
    staleTime: 120 * 1000,
  });
}

/** Carry-forward re-asks for the learner's pending sessions ("better this time?"). */
export function useCarryforward(lookbackDays = 30) {
  return useQuery({
    queryKey: scfQueryKeys.carryforward(lookbackDays),
    queryFn: () => SessionFeedbackService.getCarryforward(lookbackDays),
    staleTime: 120 * 1000, // 2026-07-31: see usePendingSessions

  });
}

export function useConfirmationStatus(from: string, to: string) {
  return useQuery({
    queryKey: scfQueryKeys.confirmation(from, to),
    queryFn: () => SessionFeedbackService.getConfirmationStatus(from, to),
    enabled: !!from && !!to,
    staleTime: 120 * 1000, // 2026-07-31: see usePendingSessions

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

/** The caller faculty's OWN low sessions + lift ("topics to revisit", B1). */
export function useFacultyFollowups(from: string, to: string) {
  return useQuery({
    queryKey: scfQueryKeys.facultyFollowups(from, to),
    queryFn: () => SessionFeedbackService.getFacultyFollowups(from, to),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}

/** The learner's private "your voice this term" receipt (C3). */
export function useMyImpact(from: string, to: string) {
  return useQuery({
    queryKey: scfQueryKeys.myImpact(from, to),
    queryFn: () => SessionFeedbackService.getMyImpact(from, to),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}

/** All-college per-institution summary (super-admin / institution leadership). */
export function useAdminCollegeSummary(from: string, to: string) {
  return useQuery({
    queryKey: scfQueryKeys.adminCollegeSummary(from, to),
    queryFn: () => SessionFeedbackService.getAdminCollegeSummary(from, to),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}

/** All-college per-faculty summary (worst understanding first). */
export function useAdminFacultySummary(from: string, to: string) {
  return useQuery({
    queryKey: scfQueryKeys.adminFacultySummary(from, to),
    queryFn: () => SessionFeedbackService.getAdminFacultySummary(from, to),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}

/** All-college per-day understanding trend. */
export function useAdminTrend(
  from: string,
  to: string,
  institutionId?: string | null,
) {
  return useQuery({
    // institutionId belongs in the key — otherwise selecting a college would
    // re-display the cached all-colleges series.
    queryKey: [...scfQueryKeys.adminTrend(from, to), institutionId ?? 'all'],
    queryFn: () => SessionFeedbackService.getAdminTrend(from, to, institutionId),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}

/** Per-learning-facilitator FEEDBACK coverage (drivers first, 0% last).
 *  College narrowing is server-side: institutionId is passed to the RPC
 *  (undefined = all colleges in the caller's scope). */
export function useFacilitatorFeedbackCoverage(from: string, to: string, institutionId?: string) {
  return useQuery({
    queryKey: [...scfQueryKeys.facilitatorCoverage(from, to), institutionId ?? 'all'],
    queryFn: () => SessionFeedbackService.getFacilitatorFeedbackCoverage(from, to, institutionId),
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

// ── Clarification requests (Lane C) — ask → self-reported outcome ────────────

/** The caller's own clarification request for one session (null when none). */
export function useClarification(attendanceDate: string, periodId: string) {
  return useQuery({
    queryKey: scfQueryKeys.clarification(attendanceDate, periodId),
    queryFn: () => SessionFeedbackService.getClarification(attendanceDate, periodId),
    enabled: !!attendanceDate && !!periodId,
    staleTime: 30 * 1000,
  });
}

/** Record "I asked for a re-explanation of this session". */
export function useAskClarification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { attendanceDate: string; timetableId: string; periodId: string }) =>
      SessionFeedbackService.askClarification(
        input.attendanceDate,
        input.timetableId,
        input.periodId,
      ),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({
        queryKey: scfQueryKeys.clarification(input.attendanceDate, input.periodId),
      });
    },
  });
}

/** The same learner self-reports what happened after their ask. */
export function useReportClarificationOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      attendanceDate: string;
      periodId: string;
      outcome: Exclude<ClarificationOutcome, 'pending'>;
    }) =>
      SessionFeedbackService.reportClarificationOutcome(
        input.attendanceDate,
        input.periodId,
        input.outcome,
      ),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({
        queryKey: scfQueryKeys.clarification(input.attendanceDate, input.periodId),
      });
    },
  });
}

/** Faculty-triggered per-session "notify pending" nudge (PR-B). Refreshes the
 *  completion + pending-roster views so the drawer reflects any change. */
export function useNotifySessionPending() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { attendanceDate: string; timetableId: string; periodId: string }) =>
      SessionFeedbackService.notifySessionPending(
        input.attendanceDate,
        input.timetableId,
        input.periodId,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scfQueryKeys.all });
    },
  });
}

// ── Live Pulse Check ─────────────────────────────────────────────────────────

/** Teacher opens a live pulse for a class (assigned faculty or HOD/admin). */
export function useOpenPulse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { attendanceDate: string; timetableId: string; periodId: string }) =>
      SessionFeedbackService.openPulse(input.attendanceDate, input.timetableId, input.periodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scfQueryKeys.all });
    },
  });
}

/** Open pulses for the caller learner's Present sessions. Polls so the answer
 *  banner appears within ~20s of a teacher opening a pulse. */
export function useOpenPulsesForLearner() {
  return useQuery({
    queryKey: scfQueryKeys.openPulsesForLearner(),
    queryFn: () => SessionFeedbackService.getOpenPulsesForLearner(),
    staleTime: 15 * 1000,
    refetchInterval: 20 * 1000,
  });
}

/** Anonymized live totals for one pulse. Polls every 10s while enabled (dialog open). */
export function usePulseTotals(pulseId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: scfQueryKeys.pulseTotals(pulseId ?? ''),
    queryFn: () => SessionFeedbackService.getPulseTotals(pulseId as string),
    enabled: enabled && !!pulseId,
    refetchInterval: 10 * 1000,
  });
}

/** The caller learner's OWN confirmed-attendance snapshot (transparency + early warning, #7). */
export function useMyConfirmedAttendance() {
  return useQuery({
    queryKey: scfQueryKeys.myConfirmedAttendance(),
    queryFn: () => SessionFeedbackService.getMyConfirmedAttendance(),
    staleTime: 60 * 1000,
  });
}

// ── Pre-session materials (Rank 3a) ──────────────────────────────────────────

/** Active materials for a session + the caller's own `opened` flag + the aggregate
 *  `open_count`. Decorative: the service returns [] on any failure, so callers can
 *  render nothing when a session has no materials (or the RPC isn't applied yet). */
export function useSessionResources(
  timetableId: string,
  attendanceDate: string,
  periodId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: scfQueryKeys.resourcesForSession(timetableId, attendanceDate, periodId),
    queryFn: () =>
      SessionFeedbackService.getResourcesForSession(timetableId, attendanceDate, periodId),
    enabled: enabled && !!timetableId && !!attendanceDate && !!periodId,
    staleTime: 30 * 1000,
  });
}

/** Post a material for a session (Senior Learner / HOD-admin). Refreshes the module
 *  views so the new material + its count appear on both surfaces. */
export function usePostSessionResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PostSessionResourceInput) =>
      SessionFeedbackService.postSessionResource(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scfQueryKeys.all });
    },
  });
}

/** Learner logs an open. Refreshes so the caller's own `opened` flag + the aggregate
 *  count update. */
export function useLogResourceOpen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: string) => SessionFeedbackService.logResourceOpen(resourceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scfQueryKeys.all });
    },
  });
}

/** Deactivate a mis-posted material (manage authority). */
export function useDeactivateSessionResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: string) =>
      SessionFeedbackService.deactivateSessionResource(resourceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scfQueryKeys.all });
    },
  });
}
