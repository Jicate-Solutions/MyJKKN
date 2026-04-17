// hooks/okr/use-team.ts
// React Query hooks for OKR Team Dashboard

import {
  useQuery,
  UseQueryResult
} from '@tanstack/react-query';
import {
  OKRTeamSummary,
  OKRNeedsAttention,
  OKRDashboardStats,
  OKRTeamFilters,
  OKRObjective
} from '@/types/okr';
import { OKRTeamService } from '@/lib/services/okr';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory for team
export const teamKeys = {
  all: ['okr-team'] as const,
  summary: (filters?: OKRTeamFilters) =>
    [...teamKeys.all, 'summary', filters] as const,
  needsAttention: (filters?: OKRTeamFilters) =>
    [...teamKeys.all, 'needs-attention', filters] as const,
  dashboardStats: (institutionId?: string) =>
    [...teamKeys.all, 'dashboard-stats', institutionId] as const,
  memberObjectives: (userId: string) =>
    [...teamKeys.all, 'member-objectives', userId] as const,
  departmentSummary: (departmentId: string) =>
    [...teamKeys.all, 'department-summary', departmentId] as const
};

/**
 * Get team summary for current user (as manager)
 */
export function useTeamSummary(
  filters: OKRTeamFilters
): UseQueryResult<OKRTeamSummary, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: teamKeys.summary(filters),
    queryFn: () => OKRTeamService.getTeamSummary(filters),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get items needing attention
 */
export function useNeedsAttention(
  filters: OKRTeamFilters
): UseQueryResult<OKRNeedsAttention[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: teamKeys.needsAttention(filters),
    queryFn: () => OKRTeamService.getNeedsAttention(filters),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.REALTIME_DATA // Always check for urgent items
  });
}

/**
 * Get dashboard statistics
 */
export function useDashboardStats(
  institutionId?: string
): UseQueryResult<OKRDashboardStats, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: teamKeys.dashboardStats(institutionId),
    queryFn: () => OKRTeamService.getDashboardStats(institutionId),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get objectives for a specific team member
 */
export function useTeamMemberObjectives(
  userId: string
): UseQueryResult<OKRObjective[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: teamKeys.memberObjectives(userId),
    queryFn: () => OKRTeamService.getTeamMemberObjectives(userId),
    enabled: !authLoading && !!profile && !!userId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get department OKR summary
 */
export function useDepartmentSummary(departmentId: string): UseQueryResult<
  {
    total_objectives: number;
    avg_progress: number;
    on_track: number;
    at_risk: number;
    behind: number;
  },
  Error
> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: teamKeys.departmentSummary(departmentId),
    queryFn: () => OKRTeamService.getDepartmentSummary(departmentId),
    enabled: !authLoading && !!profile && !!departmentId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}
