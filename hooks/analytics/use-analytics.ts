// hooks/analytics/use-analytics.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/lib/services/analytics/analytics-service';
import type { AnalyticsFilters } from '@/types/analytics';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';

/**
 * Hook to get role-based analytics filters
 * Super admin can see all institutions
 * Other roles only see their own institution/department data
 */
export function useAnalyticsFilters(baseFilters: AnalyticsFilters = {}) {
  const { profile } = useAuth();
  const { institutions, loading } = useUserInstitutionAccess();

  // If user is super admin, return base filters as-is
  const isSuperAdmin = profile?.role === 'super_admin';

  if (isSuperAdmin) {
    return {
      filters: baseFilters,
      isLoading: false,
      canViewAll: true
    };
  }

  // For other roles, apply institution/department restrictions
  const restrictedFilters: AnalyticsFilters = {
    ...baseFilters,
    institution_id: baseFilters.institution_id || profile?.institution_id || undefined,
    department_id: baseFilters.department_id || profile?.department_id || undefined
  };

  return {
    filters: restrictedFilters,
    isLoading: loading,
    canViewAll: false,
    availableInstitutions: institutions
  };
}

/**
 * Hook to fetch resource analytics
 */
export function useResourceAnalytics(filters: AnalyticsFilters = {}) {
  const { filters: rbacFilters, isLoading: filtersLoading } =
    useAnalyticsFilters(filters);

  return useQuery({
    queryKey: ['resourceAnalytics', rbacFilters],
    queryFn: () => analyticsService.getResourceAnalytics(rbacFilters),
    enabled: !filtersLoading,
    staleTime: 30 * 1000, // 30 seconds for real-time updates
    refetchInterval: 60 * 1000, // Auto-refetch every 1 minute
    refetchOnWindowFocus: true // Refetch when window regains focus
  });
}

/**
 * Hook to fetch reservation analytics
 */
export function useReservationAnalytics(filters: AnalyticsFilters = {}) {
  const { filters: rbacFilters, isLoading: filtersLoading } =
    useAnalyticsFilters(filters);

  return useQuery({
    queryKey: ['reservationAnalytics', rbacFilters],
    queryFn: () => analyticsService.getReservationAnalytics(rbacFilters),
    enabled: !filtersLoading,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refetch every 1 minute
    refetchOnWindowFocus: true
  });
}

/**
 * Hook to fetch maintenance analytics
 */
export function useMaintenanceAnalytics(filters: AnalyticsFilters = {}) {
  const { filters: rbacFilters, isLoading: filtersLoading } =
    useAnalyticsFilters(filters);

  return useQuery({
    queryKey: ['maintenanceAnalytics', rbacFilters],
    queryFn: () => analyticsService.getMaintenanceAnalytics(rbacFilters),
    enabled: !filtersLoading,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true
  });
}

/**
 * Hook to fetch user analytics
 */
export function useUserAnalytics(filters: AnalyticsFilters = {}) {
  const { filters: rbacFilters, isLoading: filtersLoading } =
    useAnalyticsFilters(filters);

  return useQuery({
    queryKey: ['userAnalytics', rbacFilters],
    queryFn: () => analyticsService.getUserAnalytics(rbacFilters),
    enabled: !filtersLoading,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true
  });
}

/**
 * Hook to fetch financial analytics
 */
export function useFinancialAnalytics(filters: AnalyticsFilters = {}) {
  const { filters: rbacFilters, isLoading: filtersLoading } =
    useAnalyticsFilters(filters);

  return useQuery({
    queryKey: ['financialAnalytics', rbacFilters],
    queryFn: () => analyticsService.getFinancialAnalytics(rbacFilters),
    enabled: !filtersLoading,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true
  });
}

/**
 * Hook to fetch complete dashboard summary
 */
export function useDashboardSummary(filters: AnalyticsFilters = {}) {
  const {
    filters: rbacFilters,
    isLoading: filtersLoading,
    canViewAll
  } = useAnalyticsFilters(filters);

  return useQuery({
    queryKey: ['dashboardSummary', rbacFilters],
    queryFn: () => analyticsService.getDashboardSummary(rbacFilters),
    enabled: !filtersLoading,
    staleTime: 30 * 1000, // 30 seconds for dashboard
    refetchInterval: 60 * 1000, // Auto-refetch every 1 minute
    refetchOnWindowFocus: true,
    select: (data) => ({
      ...data,
      _meta: {
        canViewAll,
        filters: rbacFilters
      }
    })
  });
}
