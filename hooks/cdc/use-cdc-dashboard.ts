/**
 * CDC Sprint 7b — Operational Dashboard Hooks
 *
 * One React Query hook per widget. Each widget fetches independently so
 * a slow query doesn't block the rest of the page.
 *
 * Auto-refresh every 60s while the tab is visible (operational dashboard;
 * Director wants fresh numbers without manually refreshing).
 *
 * Created: 2026-05-19 (T1.3)
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { CdcDashboardService } from '@/lib/services/cdc/dashboard-service';

const REFETCH_MS = 60_000;
const STALE_MS = 30_000;

export const cdcDashboardKeys = {
  all: ['cdc-dashboard'] as const,
  kpis: () => [...cdcDashboardKeys.all, 'kpis'] as const,
  drivesByStatus: () => [...cdcDashboardKeys.all, 'drives-by-status'] as const,
  topRecruiters: (limit: number) =>
    [...cdcDashboardKeys.all, 'top-recruiters', limit] as const,
  idpByInstitution: () => [...cdcDashboardKeys.all, 'idp-by-institution'] as const,
  trainingEnrollments: () =>
    [...cdcDashboardKeys.all, 'training-enrollments-ytd'] as const,
};

export function useCdcDashboardKpis() {
  return useQuery({
    queryKey: cdcDashboardKeys.kpis(),
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      return CdcDashboardService.getKpis(supabase);
    },
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}

export function useCdcDrivesByStatus() {
  return useQuery({
    queryKey: cdcDashboardKeys.drivesByStatus(),
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      return CdcDashboardService.getDrivesByStatus(supabase);
    },
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}

export function useCdcTopRecruiters(limit = 5) {
  return useQuery({
    queryKey: cdcDashboardKeys.topRecruiters(limit),
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      return CdcDashboardService.getTopRecruiters(supabase, limit);
    },
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}

export function useCdcIdpByInstitution() {
  return useQuery({
    queryKey: cdcDashboardKeys.idpByInstitution(),
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      return CdcDashboardService.getIdpByInstitution(supabase);
    },
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}

export function useCdcTrainingEnrollmentsYtd() {
  return useQuery({
    queryKey: cdcDashboardKeys.trainingEnrollments(),
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      return CdcDashboardService.getTrainingEnrollmentsYtd(supabase);
    },
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}
