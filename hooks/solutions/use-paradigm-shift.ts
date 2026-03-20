'use client';

/**
 * Paradigm Shift Dashboard - React Query hooks
 * Reads existing sh_* tables to compute department readiness metrics
 */

import { useQuery } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import type {
  ParadigmShiftOverview,
  DepartmentDetail,
  LeaderboardEntry,
  ReadinessTier,
} from '@/lib/services/solutions/paradigm-shift-service';

// ============================================
// QUERY HOOKS
// ============================================

export function useParadigmShiftOverview(filters?: {
  institution_id?: string;
  tier?: ReadinessTier;
}) {
  return useQuery({
    queryKey: solutionsHubKeys.paradigmShift.overview(filters),
    queryFn: () =>
      apiClient.get<ParadigmShiftOverview>('/api/solutions/paradigm-shift', {
        params: filters as Record<string, string>,
      }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

export function useParadigmShiftDepartment(departmentId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.paradigmShift.department(departmentId),
    queryFn: () =>
      apiClient.get<DepartmentDetail>(`/api/solutions/paradigm-shift/${departmentId}`),
    enabled: !!departmentId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useParadigmShiftLeaderboard(filters?: {
  institution_id?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: solutionsHubKeys.paradigmShift.leaderboard(filters),
    queryFn: () =>
      apiClient.get<LeaderboardEntry[]>('/api/solutions/paradigm-shift/leaderboard', {
        params: filters as Record<string, string>,
      }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}
