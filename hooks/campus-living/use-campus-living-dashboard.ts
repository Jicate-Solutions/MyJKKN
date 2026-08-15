'use client';

import { useQuery } from '@tanstack/react-query';
import { CampusLivingDashboard } from '@/lib/services/campus-living/campus-living-dashboard';
import { usePermissions } from '@/hooks/use-permissions';

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

/**
 * Resolve the viewer's data scope BEFORE any dashboard query runs, and put the
 * RESOLVED scope in the query key. Two bugs live in the old shape (BUG-005831):
 *
 *  1. While usePermissions loads, isSuperAdmin is still false, so a super
 *     admin's first fetch ran scoped to their own profile institution — for
 *     director@ that is the blockless JKKN Testing Institution, which renders
 *     an all-zero dashboard under a working Allocations page.
 *  2. The query key carried only institutionId, so when isSuperAdmin resolved
 *     to true the key did not change and React Query re-served the cached
 *     scoped answer instead of refetching cluster-wide.
 *
 * Same class as the Allocations "0 Allocated" bug (#2453): asking before you
 * know who is asking, then caching the wrong answer under a key that can never
 * notice. `enabled` waits for permissions, and the key is the resolved scope,
 * so neither half can recur.
 */
function useDashboardScope(institutionId: string | undefined) {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();
  return {
    scopeKey: permsLoading ? 'resolving' : isSuperAdmin ? 'all' : institutionId ?? 'none',
    serviceArg: isSuperAdmin ? undefined : institutionId,
    ready: !permsLoading && (isSuperAdmin || !!institutionId),
  };
}

// --- Query hooks ---

export function useCampusLivingOverview(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useDashboardScope(institutionId);
  return useQuery({
    queryKey: campusLivingDashboardKeys.overview(scopeKey),
    queryFn: () => CampusLivingDashboard.getDashboardData(serviceArg),
    enabled: ready,
    staleTime: 2 * 60 * 1000, // 2 minutes — dashboard data refreshes less often
  });
}

export function useResidentDemographics(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useDashboardScope(institutionId);
  return useQuery({
    queryKey: campusLivingDashboardKeys.demographics(scopeKey),
    queryFn: () => CampusLivingDashboard.getResidentDemographics(serviceArg),
    enabled: ready,
    staleTime: 2 * 60 * 1000,
  });
}

export function useBlockCategoryOccupancy(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useDashboardScope(institutionId);
  return useQuery({
    queryKey: campusLivingDashboardKeys.blockCategoryOccupancy(scopeKey),
    queryFn: () => CampusLivingDashboard.getBlockCategoryOccupancy(serviceArg),
    enabled: ready,
    staleTime: 2 * 60 * 1000,
  });
}

export function useInstitutionResidents(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useDashboardScope(institutionId);
  return useQuery({
    queryKey: campusLivingDashboardKeys.institutionResidents(scopeKey),
    queryFn: () => CampusLivingDashboard.getInstitutionResidents(serviceArg),
    enabled: ready,
    staleTime: 2 * 60 * 1000,
  });
}

export function useQuickStats(institutionId: string | undefined) {
  const { scopeKey, serviceArg, ready } = useDashboardScope(institutionId);
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
