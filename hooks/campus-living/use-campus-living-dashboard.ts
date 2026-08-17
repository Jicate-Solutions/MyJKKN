'use client';

import { useQuery } from '@tanstack/react-query';
import { CampusLivingDashboard } from '@/lib/services/campus-living/campus-living-dashboard';
import { useCampusLivingScope } from '@/hooks/campus-living/use-campus-living-scope';

// Query key factory
export const campusLivingDashboardKeys = {
  all: ['campus-living-dashboard'] as const,
  overview: (scope: string) => ['campus-living-dashboard', 'overview', scope] as const,
  hostelSummary: (scope: string) => ['campus-living-dashboard', 'hostel-summary', scope] as const,
  messSummary: (scope: string) => ['campus-living-dashboard', 'mess-summary', scope] as const,
  safetySummary: (scope: string) => ['campus-living-dashboard', 'safety-summary', scope] as const,
  alerts: (scope: string) => ['campus-living-dashboard', 'alerts', scope] as const,
  recentActivity: (scope: string) => ['campus-living-dashboard', 'recent-activity', scope] as const,
  demographics: (scope: string) => ['campus-living-dashboard', 'demographics', scope] as const,
  blockCategoryOccupancy: (scope: string) =>
    ['campus-living-dashboard', 'block-category-occupancy', scope] as const,
  institutionResidents: (scope: string) =>
    ['campus-living-dashboard', 'institution-residents', scope] as const,
};

// --- Query hooks ---
//
// Every hook below resolves the viewer's scope through useCampusLivingScope
// BEFORE fetching, and keys the cache on the RESOLVED scope. See that hook for
// why both halves are load-bearing (BUG-005831).

export function useCampusLivingOverview(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingDashboardKeys.overview(scopeKey),
    queryFn: () => CampusLivingDashboard.getDashboardData(serviceArg),
    enabled: ready,
    staleTime: 2 * 60 * 1000, // 2 minutes — dashboard data refreshes less often
  });
}

export function useResidentDemographics(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingDashboardKeys.demographics(scopeKey),
    queryFn: () => CampusLivingDashboard.getResidentDemographics(serviceArg),
    enabled: ready,
    staleTime: 2 * 60 * 1000,
  });
}

export function useBlockCategoryOccupancy(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingDashboardKeys.blockCategoryOccupancy(scopeKey),
    queryFn: () => CampusLivingDashboard.getBlockCategoryOccupancy(serviceArg),
    enabled: ready,
    staleTime: 2 * 60 * 1000,
  });
}

export function useInstitutionResidents(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingDashboardKeys.institutionResidents(scopeKey),
    queryFn: () => CampusLivingDashboard.getInstitutionResidents(serviceArg),
    enabled: ready,
    staleTime: 2 * 60 * 1000,
  });
}

export function useQuickStats(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useCampusLivingScope(institutionId);
  return useQuery({
    queryKey: campusLivingDashboardKeys.hostelSummary(scopeKey),
    queryFn: () => CampusLivingDashboard.getQuickStats(serviceArg),
    enabled: ready,
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
