// hooks/startup-studio/use-event-analytics.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { EventAnalyticsService } from '@/lib/services/startup-studio/event-analytics-service'
import { AppathonVerificationService } from '@/lib/services/startup-studio/appathon-verification-service'
import type { StartupEvent } from '@/types/startup-studio'

// Guards against Next.js 15 DRP placeholders like "%%drp:id:abc%%" passed as route params
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined | null): boolean => !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

// Re-export useEvaluatorProgress from use-appathon-verifications so callers can import it
// from either file — both share the same React Query cache key ['evaluator-progress', eventId].
export { useEvaluatorProgress } from './use-appathon-verifications'

// ─── 1. KPI Stats ─────────────────────────────────────────────────────────────

export function useEventDashboardKPIs(eventId: string) {
  const { isLoading: authLoading } = useAuth()
  return useQuery({
    queryKey: ['event-dashboard-kpis', eventId],
    queryFn: () => EventAnalyticsService.getKPIs(eventId),
    staleTime: 15_000,
    enabled: !authLoading && isValidUUID(eventId),
    retry: 3,
  })
}

// ─── 2. Submission Metrics ────────────────────────────────────────────────────

export function useEventSubmissionMetrics(eventId: string) {
  const { isLoading: authLoading } = useAuth()
  return useQuery({
    queryKey: ['event-submission-metrics', eventId],
    queryFn: () => EventAnalyticsService.getSubmissionMetrics(eventId),
    staleTime: 15_000,
    enabled: !authLoading && isValidUUID(eventId),
    retry: 3,
  })
}

// ─── 3. Attendance Summary ────────────────────────────────────────────────────

export function useEventAttendanceSummary(eventId: string) {
  const { isLoading: authLoading } = useAuth()
  return useQuery({
    queryKey: ['event-attendance-summary', eventId],
    queryFn: () => EventAnalyticsService.getAttendanceSummary(eventId),
    staleTime: 15_000,
    enabled: !authLoading && isValidUUID(eventId),
    retry: 3,
  })
}

// ─── 4. Verification Status Breakdown ────────────────────────────────────────

export function useEventVerificationSummary(eventId: string) {
  const { isLoading: authLoading } = useAuth()
  return useQuery({
    queryKey: ['event-verification-summary', eventId],
    queryFn: () => EventAnalyticsService.getVerificationSummary(eventId),
    staleTime: 15_000,
    enabled: !authLoading && isValidUUID(eventId),
    retry: 3,
  })
}

// ─── 4b. Evaluation by Date ───────────────────────────────────────────────────

export function useEventEvaluationByDate(eventId: string) {
  const { isLoading: authLoading } = useAuth()
  return useQuery({
    queryKey: ['event-evaluation-by-date', eventId],
    queryFn: () => EventAnalyticsService.getEvaluationByDate(eventId),
    staleTime: 15_000,
    enabled: !authLoading && isValidUUID(eventId),
    retry: 3,
  })
}

// ─── 5. Voting Overview ───────────────────────────────────────────────────────
// Requires the event object to resolve voting_opened_at / voting_closed_at
// so the service can determine whether voting is currently open.

export function useEventVotingOverview(
  eventId: string,
  event: StartupEvent | null | undefined
) {
  const { isLoading: authLoading } = useAuth()
  return useQuery({
    queryKey: ['event-voting-overview', eventId],
    queryFn: () =>
      EventAnalyticsService.getVotingOverview(eventId, {
        voting_opened_at: event?.voting_opened_at ?? null,
        voting_closed_at: event?.voting_closed_at ?? null,
      }),
    staleTime: 10_000,
    enabled: !authLoading && isValidUUID(eventId) && !!event,
    retry: 3,
  })
}

// ─── 6. Evaluator Progress ────────────────────────────────────────────────────
// useEvaluatorProgress already exists in use-appathon-verifications.ts with the
// exact query key ['evaluator-progress', eventId]. It is re-exported above to
// share the same cache entry — no duplicate implementation needed.
//
// Standalone hook below is provided for callers that import only from this file
// and need an explicit `authLoading` guard (the original hook omits it).

export function useEventEvaluatorProgress(eventId: string) {
  const { isLoading: authLoading } = useAuth()
  return useQuery({
    queryKey: ['evaluator-progress', eventId],
    queryFn: () => AppathonVerificationService.getEvaluatorProgress(eventId),
    staleTime: 15_000,
    enabled: !authLoading && isValidUUID(eventId),
    retry: 3,
  })
}

// ─── 7. Checklist Phase Progress ──────────────────────────────────────────────

export function useEventChecklistProgress(eventId: string) {
  const { isLoading: authLoading } = useAuth()
  return useQuery({
    queryKey: ['event-checklist-progress', eventId],
    queryFn: () => EventAnalyticsService.getChecklistProgress(eventId),
    staleTime: 30_000,
    enabled: !authLoading && isValidUUID(eventId),
    retry: 3,
  })
}

// ─── 8. Institution Breakdown (Pie Chart) ─────────────────────────────────────

export function useEventInstitutionBreakdown(eventId: string) {
  const { isLoading: authLoading } = useAuth()
  return useQuery({
    queryKey: ['event-institution-breakdown', eventId],
    queryFn: () => EventAnalyticsService.getInstitutionBreakdown(eventId),
    staleTime: 30_000,
    enabled: !authLoading && isValidUUID(eventId),
    retry: 3,
  })
}
