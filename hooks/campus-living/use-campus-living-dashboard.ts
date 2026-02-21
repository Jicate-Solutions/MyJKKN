'use client';

import { useQuery } from '@tanstack/react-query';
import { CampusLivingDashboard } from '@/lib/services/campus-living/campus-living-dashboard';

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

export function useCampusLivingOverview(institutionId: string) {
  return useQuery({
    queryKey: campusLivingDashboardKeys.overview(institutionId),
    queryFn: () => CampusLivingDashboard.getDashboardData(institutionId),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000, // 2 minutes — dashboard data refreshes less often
  });
}

export function useQuickStats(institutionId: string) {
  return useQuery({
    queryKey: campusLivingDashboardKeys.hostelSummary(institutionId),
    queryFn: () => CampusLivingDashboard.getQuickStats(institutionId),
    enabled: !!institutionId,
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
