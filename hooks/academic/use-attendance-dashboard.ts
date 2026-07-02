import { useQuery } from '@tanstack/react-query';
import { AttendanceDashboardService } from '@/lib/services/academic/attendance-dashboard-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useState, useCallback } from 'react';
import type { DashboardFilters } from '@/types/attendance-dashboard';
import { QUERY_CONFIG } from '@/lib/config/query-config';

/**
 * Hook for fetching attendance dashboard statistics
 */
export function useAttendanceStats(
  institutionId?: string,
  canViewAllInstitutions: boolean = false,
  selectedDate: Date = new Date(),
  refreshTrigger: number = 0,
  academicYearId?: string
) {
  const { profile } = useAuth();

  // Determine which institution to query.
  // Anyone who can view all institutions — a super admin OR a role holding the
  // academic.attendance.dashboard.view_all_institutions permission, both folded
  // into the `canViewAllInstitutions` flag the page passes in — may query across
  // institutions; everyone else is scoped to their own. This previously ALSO
  // required isSuperAdmin, which silently collapsed a scope='all' custom role
  // (e.g. Executive Admin Officer) back to its own institution even though it held
  // view_all_institutions — BUG-004284 "can't see all colleges". RLS still
  // enforces which institutions the caller may actually read.
  const queryInstitutionId =
    canViewAllInstitutions
      ? institutionId
      : profile?.institution_id || undefined;

  // All-institutions viewer with no specific institution picked → query across all
  // (the service omits the institution filter; RLS scopes the rows).
  const queryAllInstitutions =
    canViewAllInstitutions && institutionId === undefined;

  // Format date for query
  const dateString = selectedDate.toISOString().split('T')[0];

  const {
    data: stats,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [
      'attendance-stats',
      queryInstitutionId,
      queryAllInstitutions,
      dateString,
      academicYearId,
      refreshTrigger
    ],
    queryFn: () =>
      AttendanceDashboardService.getTodayAttendanceStats(
        queryAllInstitutions ? undefined : queryInstitutionId,
        canViewAllInstitutions,
        dateString,
        academicYearId
      ),
    enabled: queryAllInstitutions || !!queryInstitutionId,
    ...QUERY_CONFIG.DASHBOARD_DATA // Use dashboard config for stats
  });

  return {
    stats: stats || [],
    isLoading,
    error,
    refetch
  };
}

/**
 * Hook for the post-class-feedback attendance-confirmation split.
 * Same institution scoping as useAttendanceStats. Returns gateMode so the UI can
 * hide the cards entirely when the policy is 'off'. Visibility-only — never
 * affects the official attendance %.
 */
export function useConfirmationSplit(
  institutionId?: string,
  canViewAllInstitutions: boolean = false,
  selectedDate: Date = new Date(),
  refreshTrigger: number = 0
) {
  const { profile } = useAuth();

  const queryInstitutionId = canViewAllInstitutions
    ? institutionId
    : profile?.institution_id || undefined;

  const queryAllInstitutions =
    canViewAllInstitutions && institutionId === undefined;

  const dateString = selectedDate.toISOString().split('T')[0];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'attendance-confirmation-split',
      queryInstitutionId,
      queryAllInstitutions,
      dateString,
      refreshTrigger
    ],
    queryFn: () =>
      AttendanceDashboardService.getConfirmationSplit(
        dateString,
        queryAllInstitutions ? undefined : queryInstitutionId
      ),
    enabled: queryAllInstitutions || !!queryInstitutionId,
    ...QUERY_CONFIG.DASHBOARD_DATA
  });

  return {
    gateMode: data?.gateMode ?? 'off',
    windowHours: data?.windowHours ?? 48,
    split: data?.split ?? null,
    isLoading,
    error,
    refetch
  };
}

/**
 * Hook for fetching pending attendance periods
 */
export function usePendingAttendance(
  filters: DashboardFilters & { refreshTrigger?: number } = {}
) {
  const { profile } = useAuth();
  const { isSuperAdmin, canAccess } = usePermissions();

  // A super admin OR a role holding academic.attendance.dashboard.view_all_institutions
  // (e.g. Executive Admin Officer, institution_scope='all') may span every college.
  // Previously this gated on isSuperAdmin alone, which silently collapsed a scope='all'
  // custom role back to its own institution on the Pending tab — same root cause as
  // BUG-004284. The service omits the institution filter when none is given and lets
  // student_attendance RLS scope the rows.
  const canSeeAllInstitutions =
    isSuperAdmin || canAccess('academic.attendance.dashboard', 'view_all_institutions');

  const { refreshTrigger = 0, ...restFilters } = filters;

  // Use provided institution or user's institution
  const queryFilters: DashboardFilters = {
    ...restFilters,
    userInstitutionId: canSeeAllInstitutions
      ? restFilters.userInstitutionId
      : profile?.institution_id || undefined
  };

  const {
    data: pendingData,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['pending-attendance', queryFilters, refreshTrigger, canSeeAllInstitutions],
    queryFn: () =>
      AttendanceDashboardService.getTodayPendingAttendance(queryFilters),
    // All-institutions viewers may query with no institution (service omits the
    // filter, RLS scopes the rows); everyone else still requires their own institution.
    enabled: canSeeAllInstitutions || !!queryFilters.userInstitutionId,
    // Use REALTIME_DATA config for pending attendance (needs frequent updates)
    ...QUERY_CONFIG.REALTIME_DATA,
    refetchInterval: 2 * 60 * 1000 // Override: 2 minutes for pending attendance
  });

  return {
    pendingPeriods: pendingData?.data || [],
    metadata: pendingData?.metadata || {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0
    },
    isLoading,
    error,
    refetch
  };
}

/**
 * Hook for fetching active institutions (used by super admin institution selector)
 */
export function useActiveInstitutions(enabled: boolean = true) {
  const {
    data: institutions,
    isLoading,
    error
  } = useQuery({
    queryKey: ['active-institutions'],
    queryFn: () => AttendanceDashboardService.getActiveInstitutions(),
    enabled,
    ...QUERY_CONFIG.DASHBOARD_DATA
  });

  return {
    institutions: institutions || [],
    isLoading,
    error
  };
}

/**
 * Hook for attendance trend analysis
 */
export function useAttendanceTrend(institutionId?: string, days: number = 7) {
  const { profile } = useAuth();
  const { isSuperAdmin, canAccess } = usePermissions();

  // A super admin OR a role holding academic.attendance.dashboard.view_all_institutions
  // (e.g. Executive Admin Officer, institution_scope='all') may span every college —
  // same BUG-004284 fix as the Statistics and Pending tabs. Previously this gated on
  // isSuperAdmin alone, which silently collapsed a scope='all' custom role back to its
  // own institution on the Trend tab.
  const canSeeAllInstitutions =
    isSuperAdmin || canAccess('academic.attendance.dashboard', 'view_all_institutions');

  const queryInstitutionId = canSeeAllInstitutions
    ? institutionId // may be undefined → all colleges
    : profile?.institution_id; // scope='own' pinned to own institution

  // All-colleges viewer with no specific institution picked → query across all.
  // The service now omits the institution filter when none is given and lets
  // student_attendance RLS scope the rows; the existing per-day loop then sums
  // present/total across them into the combined overall %.
  const canSeeAllUnscoped =
    canSeeAllInstitutions && institutionId === undefined;

  const {
    data: trendData,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['attendance-trend', queryInstitutionId, canSeeAllUnscoped, days],
    queryFn: () =>
      AttendanceDashboardService.getAttendanceTrend(queryInstitutionId, days),
    enabled: canSeeAllUnscoped || !!queryInstitutionId,
    ...QUERY_CONFIG.DASHBOARD_DATA,
    refetchInterval: 10 * 60 * 1000 // Override: 10 minutes for trend (less frequent)
  });

  return {
    trendData: trendData || [],
    isLoading,
    error,
    refetch
  };
}

/**
 * Combined dashboard hook with state management
 */
export function useAttendanceDashboard() {
  const { profile } = useAuth();
  const { isSuperAdmin, canAccess } = usePermissions();

  // Super admin OR a view_all_institutions role (e.g. Executive Admin Officer,
  // institution_scope='all') may pick any institution / span all colleges — same
  // BUG-004284 fix as the Statistics tab. Everyone else is pinned to their own.
  const canSeeAllInstitutions =
    isSuperAdmin || canAccess('academic.attendance.dashboard', 'view_all_institutions');

  // State for filters and selected institution (for super admin)
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<
    string | undefined
  >();
  const [pendingFilters, setPendingFilters] = useState<
    Omit<DashboardFilters, 'userInstitutionId'>
  >({
    page: 1,
    limit: 10,
    sortBy: 'period_name',
    sortDirection: 'asc',
    search: '',
    departmentId: undefined,
    semesterId: undefined,
    sectionId: undefined
  });

  // Get the effective institution ID
  const effectiveInstitutionId = canSeeAllInstitutions
    ? selectedInstitutionId
    : profile?.institution_id;

  // Get stats data
  const statsQuery = useAttendanceStats(effectiveInstitutionId as string);

  // Get pending attendance data
  const pendingQuery = usePendingAttendance({
    ...pendingFilters,
    userInstitutionId: effectiveInstitutionId as string
  });

  // Get trend data
  const trendQuery = useAttendanceTrend(effectiveInstitutionId as string);

  // Update pending filters
  const updatePendingFilters = useCallback(
    (newFilters: Partial<typeof pendingFilters>) => {
      setPendingFilters((prev) => ({
        ...prev,
        ...newFilters,
        // Reset page when other filters change (unless page is being explicitly set)
        page: newFilters.page !== undefined ? newFilters.page : 1
      }));
    },
    []
  );

  // Change page
  const changePage = useCallback(
    (page: number) => {
      updatePendingFilters({ page });
    },
    [updatePendingFilters]
  );

  // Reset all filters
  const resetFilters = useCallback(() => {
    setPendingFilters({
      page: 1,
      limit: 10,
      sortBy: 'period_name',
      sortDirection: 'asc',
      search: '',
      departmentId: undefined,
      semesterId: undefined,
      sectionId: undefined
    });
  }, []);

  // Refresh all data
  const refreshAll = useCallback(() => {
    statsQuery.refetch();
    pendingQuery.refetch();
    trendQuery.refetch();
  }, [statsQuery, pendingQuery, trendQuery]);

  return {
    // Stats data
    stats: statsQuery.stats,
    statsLoading: statsQuery.isLoading,
    statsError: statsQuery.error,

    // Pending attendance data
    pendingPeriods: pendingQuery.pendingPeriods,
    pendingMetadata: pendingQuery.metadata,
    pendingLoading: pendingQuery.isLoading,
    pendingError: pendingQuery.error,

    // Trend data
    trendData: trendQuery.trendData,
    trendLoading: trendQuery.isLoading,
    trendError: trendQuery.error,

    // State and controls
    selectedInstitutionId,
    setSelectedInstitutionId,
    pendingFilters,
    updatePendingFilters,
    changePage,
    resetFilters,
    refreshAll,

    // Permissions
    isSuperAdmin,
    effectiveInstitutionId
  };
}
