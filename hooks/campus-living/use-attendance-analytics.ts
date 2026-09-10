'use client';

import { useQuery } from '@tanstack/react-query';
import { AttendanceAnalyticsService } from '@/lib/services/campus-living/attendance-analytics-service';
import { useCampusLivingScope } from '@/hooks/campus-living/use-campus-living-scope';

/**
 * Hostel attendance analytics hooks.
 *
 * Every key carries the RESOLVED viewer scope from useCampusLivingScope, and
 * every `enabled` waits for permissions to load. Both halves are required —
 * the four hooks in use-hostel-attendance.ts never adopted this and still carry
 * BUG-005831 (a super admin's first fetch runs scoped to their own blockless
 * institution, then the answer is cached under a key that can never notice it
 * was wrong). Do not copy the older shape into this file.
 *
 * The RPCs are SECURITY INVOKER and take no institution argument — RLS does the
 * scoping server-side. `scopeKey` is still in the key so a super admin toggling
 * scope, or two different viewers on one machine, cannot share a cache entry.
 */
export const attendanceAnalyticsKeys = {
  all: ['campus-living-attendance-analytics'] as const,
  dashboard: (filters: Record<string, unknown>) =>
    ['campus-living-attendance-analytics', 'dashboard', filters] as const,
  learnerDetail: (filters: Record<string, unknown>) =>
    ['campus-living-attendance-analytics', 'learner-detail', filters] as const,
};

export function useAttendanceDashboardAnalytics(
  institutionId: string | undefined,
  from: string,
  to: string,
  blockId?: string | null,
) {
  const { scopeKey, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: attendanceAnalyticsKeys.dashboard({ scope: scopeKey, from, to, blockId: blockId ?? null }),
    queryFn: () => AttendanceAnalyticsService.getDashboard(from, to, blockId),
    enabled: ready && !!from && !!to,
  });
}

export function useAttendanceLearnerDetail(
  institutionId: string | undefined,
  learnerId: string | undefined,
  from: string,
  to: string,
) {
  const { scopeKey, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: attendanceAnalyticsKeys.learnerDetail({ scope: scopeKey, learnerId, from, to }),
    queryFn: () => AttendanceAnalyticsService.getLearnerDetail(learnerId as string, from, to),
    enabled: ready && !!learnerId && !!from && !!to,
  });
}
