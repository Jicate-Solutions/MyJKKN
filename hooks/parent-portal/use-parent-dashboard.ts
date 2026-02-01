// hooks/parent-portal/use-parent-dashboard.ts

import { useQuery } from '@tanstack/react-query';
import { ParentPortalService } from '@/lib/services/parent-portal/parent-portal-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const parentDashboardKeys = {
  all: ['parent-dashboard'] as const,
  dashboard: (parentId: string) => [...parentDashboardKeys.all, parentId] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

export function useParentDashboard(parentId: string) {
  return useQuery({
    queryKey: parentDashboardKeys.dashboard(parentId),
    queryFn: () => ParentPortalService.getDashboard(parentId),
    enabled: !!parentId,
    staleTime: 2 * 60 * 1000, // 2 minutes - dashboard data should be relatively fresh
    refetchOnWindowFocus: true, // Refresh when user returns to the tab
  });
}
