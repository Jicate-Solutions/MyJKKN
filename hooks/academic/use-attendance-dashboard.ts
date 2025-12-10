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
  const { isSuperAdmin } = usePermissions();

  // Determine which institution to query
  // For super admin: undefined = all institutions, specific id = that institution
  // For regular users: always their own institution
  const queryInstitutionId =
    isSuperAdmin && canViewAllInstitutions
      ? institutionId
      : profile?.institution_id || undefined;

  // For super admin with undefined institutionId, query all institutions
  const queryAllInstitutions =
    isSuperAdmin && canViewAllInstitutions && institutionId === undefined;

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
        canViewAllInstitutions && isSuperAdmin,
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
 * Hook for fetching pending attendance periods
 */
export function usePendingAttendance(
  filters: DashboardFilters & { refreshTrigger?: number } = {}
) {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const { refreshTrigger = 0, ...restFilters } = filters;

  // Use provided institution or user's institution
  const queryFilters: DashboardFilters = {
    ...restFilters,
    userInstitutionId: isSuperAdmin
      ? restFilters.userInstitutionId
      : profile?.institution_id || undefined
  };

  const {
    data: pendingData,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['pending-attendance', queryFilters, refreshTrigger],
    queryFn: () =>
      AttendanceDashboardService.getTodayPendingAttendance(queryFilters),
    enabled: !!queryFilters.userInstitutionId,
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
 * Hook for attendance trend analysis
 */
export function useAttendanceTrend(institutionId?: string, days: number = 7) {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  // Determine which institution to query
  const queryInstitutionId = isSuperAdmin
    ? institutionId
    : profile?.institution_id;

  const {
    data: trendData,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['attendance-trend', queryInstitutionId, days],
    queryFn: () =>
      AttendanceDashboardService.getAttendanceTrend(queryInstitutionId!, days),
    enabled: !!queryInstitutionId,
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
  const { isSuperAdmin } = usePermissions();

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
  const effectiveInstitutionId = isSuperAdmin
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
