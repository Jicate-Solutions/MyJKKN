import { useQuery } from '@tanstack/react-query';
import {
  AttendanceDashboardService,
  type AttendanceHierarchyFilter
} from '@/lib/services/academic/attendance-dashboard-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useState, useCallback } from 'react';
import type { DashboardFilters } from '@/types/attendance-dashboard';
import { QUERY_CONFIG } from '@/lib/config/query-config';

/**
 * Shared default for the optional hierarchy argument. A module-level constant,
 * not an inline `= {}` default: the latter allocates a new object on every
 * render, and these hooks put the value straight into a React Query key.
 * Structural hashing would still match, but a stable reference keeps the
 * dependency identity honest for callers that memoize on it.
 */
const EMPTY_HIERARCHY: AttendanceHierarchyFilter = {};

/**
 * Hook for fetching attendance dashboard statistics
 */
export function useAttendanceStats(
  institutionId?: string,
  canViewAllInstitutions: boolean = false,
  selectedDate: Date = new Date(),
  refreshTrigger: number = 0,
  academicYearId?: string,
  hierarchy: AttendanceHierarchyFilter = EMPTY_HIERARCHY
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
      hierarchy,
      refreshTrigger
    ],
    queryFn: () =>
      AttendanceDashboardService.getTodayAttendanceStats(
        queryAllInstitutions ? undefined : queryInstitutionId,
        canViewAllInstitutions,
        dateString,
        academicYearId,
        hierarchy
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
 * Trailing window (days, inclusive of the selected date) the confirmation split
 * covers. Must exceed window_hours/24 for the "overdue" bucket to be meaningful
 * (with the default window_hours=48 → 2d, 14d leaves ~12d of overdue headroom).
 * COUPLING: if an institution ever raises session_feedback.window_hours above
 * ~336h (14d), overdue would be structurally near-empty within this fixed span —
 * revisit this constant (or derive it from window_hours) if that policy changes.
 */
const SPLIT_WINDOW_DAYS = 14;

/**
 * Hook for the post-class-feedback attendance-confirmation split.
 * Same institution scoping as useAttendanceStats. Returns gateMode so the UI can
 * hide the cards entirely when the policy is 'off'. Visibility-only — never
 * affects the official attendance %. Covers a rolling SPLIT_WINDOW_DAYS window
 * ending at the selected date (so "overdue" is not structurally always 0).
 */
export function useConfirmationSplit(
  institutionId?: string,
  canViewAllInstitutions: boolean = false,
  selectedDate: Date = new Date(),
  refreshTrigger: number = 0,
  // Callers may widen the rolling window. The Feedback Confirmation tab passes 30
  // so its cards cover the SAME span as the college tables beneath them — before
  // this, the cards said "last 14 days" while "Responses" underneath was a 30-day
  // number, and the two looked contradictory. The Statistics tab keeps the 14-day
  // default, so this is a prop rather than a change to SPLIT_WINDOW_DAYS.
  windowDays: number = SPLIT_WINDOW_DAYS,
  // Narrowed by the same dashboard filter bar as the stat cards above. The
  // rollup RPC has no degree/semester params, so a Degree- or Semester-only
  // selection leaves this split at the next-widest scope it can express.
  hierarchy: AttendanceHierarchyFilter = EMPTY_HIERARCHY
) {
  const { profile } = useAuth();

  const queryInstitutionId = canViewAllInstitutions
    ? institutionId
    : profile?.institution_id || undefined;

  const queryAllInstitutions =
    canViewAllInstitutions && institutionId === undefined;

  // The split covers a ROLLING window ending at the selected date, not a single
  // day: with window_hours=48 a single-day (today) view can never produce an
  // "overdue" mark, making that bucket structurally dead. A trailing window
  // surfaces the accumulated confirmation gap leadership cares about.
  // Dates are IST wall-clock via Intl (timeZone Asia/Kolkata) — NOT toISOString()
  // (UTC) or local getDate (browser-tz-dependent) — because the RPC anchors its
  // buckets to Asia/Kolkata; correct regardless of the admin's client TZ.
  const istDate = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  const toDate = istDate(selectedDate);
  const fromDate = istDate(
    new Date(selectedDate.getTime() - (windowDays - 1) * 86_400_000)
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'attendance-confirmation-split',
      queryInstitutionId,
      queryAllInstitutions,
      fromDate,
      toDate,
      hierarchy,
      refreshTrigger
    ],
    queryFn: () =>
      AttendanceDashboardService.getConfirmationSplit(
        fromDate,
        toDate,
        queryAllInstitutions ? undefined : queryInstitutionId,
        hierarchy
      ),
    enabled: queryAllInstitutions || !!queryInstitutionId,
    ...QUERY_CONFIG.DASHBOARD_DATA
  });

  return {
    gateMode: data?.gateMode ?? 'off',
    windowHours: data?.windowHours ?? 48,
    windowDays,
    split: data?.split ?? null,
    isLoading,
    // Surface both a thrown query error and an RPC-level error the service
    // caught (which returns split=null) — so the UI can distinguish a load
    // failure from a genuine empty result instead of showing fake zeros.
    isError: !!error || !!data?.error,
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
 * Default trailing window (days) for the current-intake readiness check.
 * A section that has not been marked once in three weeks is not "running late",
 * it has never started — which is the distinction the panel is drawing.
 */
export const INTAKE_READINESS_DEFAULT_WINDOW_DAYS = 21;

/**
 * Hook for the current-intake attendance readiness check.
 *
 * Unlike usePendingAttendance, this is NOT date-scoped and NOT derived from
 * timetables — it asks, for every section holding current-intake learners,
 * whether attendance is even possible there. A section with no timetable is
 * invisible to the pending surface and is exactly what this surfaces.
 *
 * Institution scoping mirrors the other dashboard hooks: an all-colleges viewer
 * with no institution picked queries across all (the RPC bounds rows by
 * role_has_institution_access); everyone else is pinned to their own.
 */
export function useIntakeReadiness(
  institutionId?: string,
  canViewAllInstitutions: boolean = false,
  windowDays: number = INTAKE_READINESS_DEFAULT_WINDOW_DAYS,
  departmentId?: string,
  refreshTrigger: number = 0
) {
  const { profile } = useAuth();

  const queryInstitutionId = canViewAllInstitutions
    ? institutionId
    : profile?.institution_id || undefined;

  const queryAllInstitutions =
    canViewAllInstitutions && institutionId === undefined;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'attendance-intake-readiness',
      queryInstitutionId,
      queryAllInstitutions,
      windowDays,
      departmentId,
      refreshTrigger
    ],
    queryFn: () =>
      AttendanceDashboardService.getIntakeReadiness(
        windowDays,
        queryAllInstitutions ? undefined : queryInstitutionId,
        departmentId
      ),
    enabled: queryAllInstitutions || !!queryInstitutionId,
    ...QUERY_CONFIG.DASHBOARD_DATA
  });

  const rows = data ?? [];

  return {
    rows,
    summaries: AttendanceDashboardService.summariseIntakeReadiness(rows),
    windowDays,
    isLoading,
    isError: !!error,
    refetch
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
