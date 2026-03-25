import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserDashboardService } from '@/lib/services/users/user-dashboard-service';
import { UserDashboardStats, UserDashboardFilters } from '@/types/users';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { usePermissions } from '@/hooks/use-permissions';

export function useUserDashboardStats(
  initialFilters: UserDashboardFilters = {}
) {
  const { isSuperAdmin, userProfile: profile } = usePermissions();
  const { institutions, canAccessAllInstitutions } = useUserInstitutionAccess();

  const [filters, setFilters] = useState<UserDashboardFilters>(() => {
    // If user is not super admin and has institution restriction, set default institution
    if (!canAccessAllInstitutions && profile?.institution_id) {
      return {
        ...initialFilters,
        institutionId: profile.institution_id
      };
    }
    return initialFilters;
  });

  // Main dashboard stats query
  const {
    data: dashboardStats,
    isLoading,
    error,
    refetch
  } = useQuery<UserDashboardStats, Error>({
    queryKey: ['userDashboardStats', filters],
    queryFn: () => UserDashboardService.getUserDashboardStats(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    enabled: true
  });

  // Activity summary query for quick insights
  const {
    data: activitySummary,
    isLoading: isLoadingActivity,
    refetch: refetchActivity
  } = useQuery({
    queryKey: ['userActivitySummary', filters.institutionId],
    queryFn: () =>
      UserDashboardService.getUserActivitySummary(filters.institutionId),
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false
  });

  // Role-based stats query
  const {
    data: roleStats,
    isLoading: isLoadingRoles,
    refetch: refetchRoles
  } = useQuery({
    queryKey: ['roleBasedStats', filters.institutionId],
    queryFn: () =>
      UserDashboardService.getRoleBasedStats(filters.institutionId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Registration trends query
  const {
    data: registrationTrends,
    isLoading: isLoadingTrends,
    refetch: refetchTrends
  } = useQuery({
    queryKey: ['registrationTrends', filters.institutionId],
    queryFn: () =>
      UserDashboardService.getRegistrationTrends(30, filters.institutionId),
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false
  });

  // Institution distribution query (only for super admins)
  const {
    data: institutionDistribution,
    isLoading: isLoadingInstitutions,
    refetch: refetchInstitutions
  } = useQuery({
    queryKey: ['institutionDistribution'],
    queryFn: () => UserDashboardService.getInstitutionDistribution(),
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    enabled: canAccessAllInstitutions
  });

  // Top users queries
  const {
    data: topActiveUsers,
    isLoading: isLoadingTopActive,
    refetch: refetchTopActive
  } = useQuery({
    queryKey: ['topUsers', 'recent_login', filters.institutionId],
    queryFn: () =>
      UserDashboardService.getTopUsers(
        10,
        'recent_login',
        filters.institutionId
      ),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const {
    data: recentRegistrations,
    isLoading: isLoadingRecentRegs,
    refetch: refetchRecentRegs
  } = useQuery({
    queryKey: ['topUsers', 'recent_registration', filters.institutionId],
    queryFn: () =>
      UserDashboardService.getTopUsers(
        10,
        'recent_registration',
        filters.institutionId
      ),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Update filters with validation
  const updateFilters = useCallback(
    (newFilters: Partial<UserDashboardFilters>) => {
      setFilters((prev) => {
        const updated = { ...prev, ...newFilters };

        // Ensure institution restriction for non-super admins
        if (!canAccessAllInstitutions && profile?.institution_id) {
          updated.institutionId = profile.institution_id;
        }

        return updated;
      });
    },
    [canAccessAllInstitutions, profile?.institution_id]
  );

  // Clear filters (respecting institution restrictions)
  const clearFilters = useCallback(() => {
    const baseFilters: UserDashboardFilters = {};

    // Keep institution restriction for non-super admins
    if (!canAccessAllInstitutions && profile?.institution_id) {
      baseFilters.institutionId = profile.institution_id;
    }

    setFilters(baseFilters);
  }, [canAccessAllInstitutions, profile?.institution_id]);

  // Refresh all data
  const refreshAll = useCallback(() => {
    refetch();
    refetchActivity();
    refetchRoles();
    refetchTrends();
    if (canAccessAllInstitutions) {
      refetchInstitutions();
    }
    refetchTopActive();
    refetchRecentRegs();
  }, [
    refetch,
    refetchActivity,
    refetchRoles,
    refetchTrends,
    refetchInstitutions,
    refetchTopActive,
    refetchRecentRegs,
    canAccessAllInstitutions
  ]);

  // Export data
  const exportData = useCallback(
    async (format: 'csv' | 'excel' = 'csv') => {
      try {
        const blob = await UserDashboardService.exportDashboardData(
          filters,
          format
        );

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `user-dashboard-${
          new Date().toISOString().split('T')[0]
        }.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (error) {
        console.error('Export failed:', error);
        throw error;
      }
    },
    [filters]
  );

  // Derived state
  const isLoading_combined =
    isLoading || isLoadingActivity || isLoadingRoles || isLoadingTrends;
  const hasData = !!dashboardStats && !!activitySummary;

  // Calculate key metrics for quick access
  const keyMetrics = dashboardStats
    ? {
        totalUsers: dashboardStats.overview.totalUsers,
        activeUsers: dashboardStats.overview.activeUsers,
        growthRate: dashboardStats.overview.growthRate,
        profileCompletionRate: dashboardStats.overview.profileCompletionRate,
        newUsersThisMonth: dashboardStats.overview.newUsersThisMonth,
        activeWithin7Days: dashboardStats.overview.lastLoginWithin7Days
      }
    : null;

  return {
    // Data
    dashboardStats,
    activitySummary,
    roleStats,
    registrationTrends,
    institutionDistribution,
    topActiveUsers,
    recentRegistrations,
    keyMetrics,

    // State
    filters,
    isLoading: isLoading_combined,
    error,
    hasData,

    // Loading states for individual queries
    loadingStates: {
      dashboard: isLoading,
      activity: isLoadingActivity,
      roles: isLoadingRoles,
      trends: isLoadingTrends,
      institutions: isLoadingInstitutions,
      topActive: isLoadingTopActive,
      recentRegs: isLoadingRecentRegs
    },

    // Actions
    updateFilters,
    clearFilters,
    refreshAll,
    exportData,

    // Refetch functions for individual queries
    refetch: {
      dashboard: refetch,
      activity: refetchActivity,
      roles: refetchRoles,
      trends: refetchTrends,
      institutions: refetchInstitutions,
      topActive: refetchTopActive,
      recentRegs: refetchRecentRegs
    },

    // Permissions and access control
    canAccessAllInstitutions: canAccessAllInstitutions,
    userInstitutions: institutions,
    isSuperAdmin
  };
}

// Simplified hook for basic user stats
export function useUserStats(institutionId?: string) {
  return useQuery({
    queryKey: ['userStats', institutionId],
    queryFn: () => UserDashboardService.getUserActivitySummary(institutionId),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}

// Hook for role distribution only
export function useRoleDistribution(institutionId?: string) {
  return useQuery({
    queryKey: ['roleDistribution', institutionId],
    queryFn: () => UserDashboardService.getRoleBasedStats(institutionId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}

// Hook for registration trends only
export function useRegistrationTrends(
  days: number = 30,
  institutionId?: string
) {
  return useQuery({
    queryKey: ['registrationTrends', days, institutionId],
    queryFn: () =>
      UserDashboardService.getRegistrationTrends(days, institutionId),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}
