'use client';

import { useQuery } from '@tanstack/react-query';
import {
  FacultyCalendarInsightsService,
  InsightsAccessError,
  type InsightsScope,
  type PeriodChoice
} from '@/lib/services/academic/faculty-calendar-insights-service';

const STALE_MS = 2 * 60 * 1000;

const scopeKey = (scope: InsightsScope | null) =>
  scope
    ? [scope.institutionId, scope.departmentId ?? 'all', scope.accessibleInstitutionIds.join(',')]
    : ['none'];

// An access refusal will not change on retry; anything else gets one more try.
const retry = (count: number, error: unknown) =>
  !(error instanceof InsightsAccessError) && count < 1;

export function useInsightPeriods(institutionId: string | null) {
  return useQuery({
    queryKey: ['senior-learner-insights', 'periods', institutionId],
    queryFn: () => FacultyCalendarInsightsService.getPeriods(institutionId!),
    enabled: !!institutionId,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}

/** Per-institution answer to "may this viewer read colleagues' leave?" */
export function useLeaveVisibility(scope: InsightsScope | null, enabled: boolean) {
  return useQuery({
    queryKey: ['senior-learner-insights', 'leave-visibility', ...scopeKey(scope)],
    queryFn: () => FacultyCalendarInsightsService.isLeaveVisibleForInstitution(scope!),
    enabled: enabled && !!scope,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry
  });
}

export function useSeniorLearnerAvailability(
  scope: InsightsScope | null,
  date: string,
  period: PeriodChoice | null
) {
  return useQuery({
    queryKey: ['senior-learner-insights', 'availability', ...scopeKey(scope), date, period?.id],
    queryFn: () => FacultyCalendarInsightsService.getAvailability(scope!, date, period!),
    enabled: !!scope && !!date && !!period,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    retry
  });
}

export function useSeniorLearnerWorkload(scope: InsightsScope | null, date: string) {
  return useQuery({
    queryKey: ['senior-learner-insights', 'workload', ...scopeKey(scope), date],
    queryFn: () => FacultyCalendarInsightsService.getWorkload(scope!, date),
    enabled: !!scope && !!date,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    retry
  });
}

export function useSeniorLearnerConflicts(scope: InsightsScope | null, date: string) {
  return useQuery({
    queryKey: ['senior-learner-insights', 'conflicts', ...scopeKey(scope), date],
    queryFn: () => FacultyCalendarInsightsService.getConflicts(scope!, date),
    enabled: !!scope && !!date,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    retry
  });
}
