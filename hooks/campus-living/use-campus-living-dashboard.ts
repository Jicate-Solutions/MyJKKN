'use client';

import { useQuery } from '@tanstack/react-query';
import { CampusLivingDashboard } from '@/lib/services/campus-living/campus-living-dashboard';
import { usePermissions } from '@/hooks/use-permissions';

// Query key factory
export const campusLivingDashboardKeys = {
  all: ['campus-living-dashboard'] as const,
  overview: (institutionId: string) => ['campus-living-dashboard', 'overview', institutionId] as const,
  hostelSummary: (institutionId: string) => ['campus-living-dashboard', 'hostel-summary', institutionId] as const,
  messSummary: (institutionId: string) => ['campus-living-dashboard', 'mess-summary', institutionId] as const,
  safetySummary: (institutionId: string) => ['campus-living-dashboard', 'safety-summary', institutionId] as const,
  alerts: (institutionId: string) => ['campus-living-dashboard', 'alerts', institutionId] as const,
  recentActivity: (institutionId: string) => ['campus-living-dashboard', 'recent-activity', institutionId] as const,
};

// --- Query hooks ---

export function useCampusLivingOverview(institutionId: string | undefined) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: campusLivingDashboardKeys.overview(institutionId ?? 'all'),
    queryFn: () => CampusLivingDashboard.getDashboardData(isSuperAdmin ? undefined : institutionId),
    enabled: isSuperAdmin || !!institutionId,
    staleTime: 2 * 60 * 1000, // 2 minutes — dashboard data refreshes less often
  });
}

export function useQuickStats(institutionId: string | undefined) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: campusLivingDashboardKeys.hostelSummary(institutionId ?? 'all'),
    queryFn: () => CampusLivingDashboard.getQuickStats(isSuperAdmin ? undefined : institutionId),
    enabled: isSuperAdmin || !!institutionId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useBlockDashboard(blockId: string) {
  return useQuery({
    queryKey: ['campus-living-dashboard', 'block', blockId] as const,
    queryFn: () => CampusLivingDashboard.getBlockDashboard(blockId),
    enabled: !!blockId,
    staleTime: 2 * 60 * 1000,
  });
}
