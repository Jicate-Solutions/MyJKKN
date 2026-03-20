import { useQuery } from '@tanstack/react-query';
import { AttendanceDashboardService } from '@/lib/services/academic/attendance-dashboard-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useState, useCallback } from 'react';
import type { DashboardFilters, PendingAttendancePeriod } from '@/types/attendance-dashboard';
import { QUERY_CONFIG } from '@/lib/config/query-config';

/**
 * Hook for the standalone Pending Attendance page (/academic/attendance/pending).
 *
 * Differences from usePendingAttendance (dashboard hook):
 * - Manages filter state internally (not passed in from parent)
 * - Default sort: attendance_date desc (backlog view)
 * - Default date range: last 7 days → today
 * - Longer refetch interval (5 min) — this is a backlog view, not a live dashboard
 * - Super Admin is always enabled (can query all institutions without selecting one)
 * - Returns extended metadata (overdueCount, todayCount, sectionsCount, subjectsCount, staffCount)
 */
export function usePendingAttendanceDateRange() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const userInstitutionId = profile?.institution_id || undefined;

  // Compute default date range once at mount time
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    return {
      page: 1,
      limit: 10,
      sortBy: 'attendance_date',
      sortDirection: 'desc',
      startDate: sevenDaysAgo,
      endDate: today,
    };
  });

  // Build query filters — super admins can pass their selected institution via
  // filters.userInstitutionId; non-super-admins always use their own institution.
  const queryFilters: DashboardFilters = {
    ...filters,
    userInstitutionId: isSuperAdmin
      ? filters.userInstitutionId
      : userInstitutionId,
  };

  // Super Admin can always query (they may or may not have an institution selected).
  // All other roles require an institution to be set.
  const enabled = isSuperAdmin ? true : !!userInstitutionId;

  const {
    data: pendingData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['pending-attendance-date-range', queryFilters],
    queryFn: () => AttendanceDashboardService.getTodayPendingAttendance(queryFilters),
    enabled,
    ...QUERY_CONFIG.REALTIME_DATA,
    refetchInterval: 5 * 60 * 1000, // Override: 5 minutes — backlog view, less frequent
  });

  /**
   * Update one or more filters. Automatically resets page to 1 unless
   * the caller explicitly passes a new page value.
   */
  const updateFilters = useCallback((partial: Partial<DashboardFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...partial,
      page: partial.page !== undefined ? partial.page : 1,
    }));
  }, []);

  /**
   * Reset all filters back to the defaults used at mount time.
   */
  const resetFilters = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    setFilters({
      page: 1,
      limit: 10,
      sortBy: 'attendance_date',
      sortDirection: 'desc',
      startDate: sevenDaysAgo,
      endDate: today,
    });
  }, []);

  return {
    pendingPeriods: (pendingData?.data || []) as PendingAttendancePeriod[],
    metadata: pendingData?.metadata || {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
      overdueCount: 0,
      todayCount: 0,
      sectionsCount: 0,
      subjectsCount: 0,
      staffCount: 0,
    },
    isLoading,
    error: error as Error | null,
    refetch,
    filters,
    updateFilters,
    resetFilters,
    isSuperAdmin,
    effectiveInstitutionId: isSuperAdmin ? filters.userInstitutionId : userInstitutionId,
  };
}
