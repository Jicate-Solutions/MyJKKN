// hooks/parent-portal/use-parent-dashboard.ts

import { useQuery } from '@tanstack/react-query';
import { ParentPortalService } from '@/lib/services/parent-portal/parent-portal-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const parentDashboardKeys = {
  all: ['parent-dashboard'] as const,
  dashboard: () => [...parentDashboardKeys.all, 'current'] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Hook to get the parent dashboard data
 * Now uses server-side session validation - no parentId parameter needed
 */
export function useParentDashboard() {
  return useQuery({
    queryKey: parentDashboardKeys.dashboard(),
    queryFn: () => ParentPortalService.getDashboard(),
    staleTime: 2 * 60 * 1000, // 2 minutes - dashboard data should be relatively fresh
    refetchOnWindowFocus: true, // Refresh when user returns to the tab
  });
}
