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
    queryFn: () => CampusLivingDashboard.getOverview(institutionId),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000, // 2 minutes — dashboard data refreshes less often
  });
}

export function useHostelSummary(institutionId: string) {
  return useQuery({
    queryKey: campusLivingDashboardKeys.hostelSummary(institutionId),
    queryFn: () => CampusLivingDashboard.getHostelSummary(institutionId),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useMessSummary(institutionId: string) {
  return useQuery({
    queryKey: campusLivingDashboardKeys.messSummary(institutionId),
    queryFn: () => CampusLivingDashboard.getMessSummary(institutionId),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useSafetySummary(institutionId: string) {
  return useQuery({
    queryKey: campusLivingDashboardKeys.safetySummary(institutionId),
    queryFn: () => CampusLivingDashboard.getSafetySummary(institutionId),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useDashboardAlerts(institutionId: string) {
  return useQuery({
    queryKey: campusLivingDashboardKeys.alerts(institutionId),
    queryFn: () => CampusLivingDashboard.getAlerts(institutionId),
    enabled: !!institutionId,
    staleTime: 60 * 1000, // 1 minute — alerts refresh more often
  });
}

export function useRecentActivity(institutionId: string) {
  return useQuery({
    queryKey: campusLivingDashboardKeys.recentActivity(institutionId),
    queryFn: () => CampusLivingDashboard.getRecentActivity(institutionId),
    enabled: !!institutionId,
    staleTime: 60 * 1000,
  });
}
