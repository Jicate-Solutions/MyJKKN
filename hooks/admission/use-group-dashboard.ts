'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { GroupDashboardService } from '@/lib/services/admission/group-dashboard-service';

export const groupDashboardKeys = {
  all: ['admission-group-dashboard'] as const,
  overview: (institutionIds?: string[], admissionYearId?: string | null, programStartYear?: number | null) =>
    [
      ...groupDashboardKeys.all,
      'overview',
      institutionIds ?? 'all',
      admissionYearId ?? 'no-ay',
      programStartYear ?? 'no-year',
    ] as const,
  seatAnalytics: (institutionId?: string) =>
    [...groupDashboardKeys.all, 'seats', institutionId ?? 'all'] as const,
  seatDailyPivot: (institutionIds?: string[], admissionYear?: number, excludeBulkMigrated?: boolean) =>
    [
      ...groupDashboardKeys.all,
      'seat-daily-pivot',
      institutionIds ?? 'all',
      admissionYear ?? 'no-year',
      excludeBulkMigrated ?? false,
    ] as const,
  sourceAnalytics: (institutionIds?: string[], admissionYear?: number | null) =>
    [
      ...groupDashboardKeys.all,
      'sources',
      institutionIds ?? 'all',
      admissionYear ?? 'no-year',
    ] as const,
  geographyAnalytics: (institutionIds?: string[], admissionYear?: number | null) =>
    [
      ...groupDashboardKeys.all,
      'geography',
      institutionIds ?? 'all',
      admissionYear ?? 'no-year',
    ] as const,
  institutionComparison: () =>
    [...groupDashboardKeys.all, 'comparison'] as const,
};

// Invalidates all seat-analytics queries when learners_profiles changes (near-realtime).
// A single channel is shared at the hook level via a module-scope ref.
let realtimeChannel: ReturnType<ReturnType<typeof createClientSupabaseClient>['channel']> | null = null;

function useSeatsRealtimeInvalidation() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (realtimeChannel) return;
    const supabase = createClientSupabaseClient();
    realtimeChannel = supabase
      .channel('seat-analytics-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'learners_profiles' },
        () => {
          queryClient.invalidateQueries({ queryKey: groupDashboardKeys.all });
        }
      )
      .subscribe();
    return () => {
      realtimeChannel?.unsubscribe();
      realtimeChannel = null;
    };
  }, [queryClient]);
}

export function useGroupDashboard(
  institutionIds?: string[],
  admissionYearId?: string | null,
  programStartYear?: number | null
) {
  return useQuery({
    queryKey: groupDashboardKeys.overview(institutionIds, admissionYearId, programStartYear),
    queryFn: () =>
      GroupDashboardService.getGroupDashboard(institutionIds, admissionYearId, programStartYear),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    // Wait until we know which year to query — prevents an all-time fetch
    // before GroupAdmissionYearSelect resolves the default cohort.
    enabled: programStartYear !== null && programStartYear !== undefined,
  });
}

export function useSeatAnalytics(institutionId?: string) {
  useSeatsRealtimeInvalidation();
  return useQuery({
    queryKey: groupDashboardKeys.seatAnalytics(institutionId),
    queryFn: () => GroupDashboardService.getSeatAnalytics(institutionId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useSeatDailyPivot(
  institutionIds: string[] | undefined,
  admissionYear: number | null,
  excludeBulkMigrated = false
) {
  useSeatsRealtimeInvalidation();
  return useQuery({
    queryKey: groupDashboardKeys.seatDailyPivot(institutionIds, admissionYear ?? undefined, excludeBulkMigrated),
    // institutionIds === undefined  =>  super-admin "all institutions"; service resolves them via RLS.
    // institutionIds === []         =>  scoped user with no access; service short-circuits to [].
    queryFn: () =>
      GroupDashboardService.getSeatDailyPivot(institutionIds, admissionYear!, excludeBulkMigrated),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // Wait until we know which year to query. We allow institutionIds === undefined
    // (super-admin path) but block when it's an empty array (no access).
    enabled:
      admissionYear !== null && admissionYear !== undefined
      && (institutionIds === undefined || institutionIds.length > 0),
  });
}

export function useSourceAnalytics(
  institutionIds: string[] | undefined,
  admissionYear: number | null
) {
  useSeatsRealtimeInvalidation();
  return useQuery({
    queryKey: groupDashboardKeys.sourceAnalytics(institutionIds, admissionYear),
    queryFn: () => GroupDashboardService.getSourceAnalytics(institutionIds, admissionYear),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled:
      admissionYear !== null && admissionYear !== undefined
      && (institutionIds === undefined || institutionIds.length > 0),
  });
}

export function useGeographyAnalytics(
  institutionIds: string[] | undefined,
  admissionYear: number | null
) {
  useSeatsRealtimeInvalidation();
  return useQuery({
    queryKey: groupDashboardKeys.geographyAnalytics(institutionIds, admissionYear),
    queryFn: () => GroupDashboardService.getGeographyAnalytics(institutionIds, admissionYear),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled:
      admissionYear !== null && admissionYear !== undefined
      && (institutionIds === undefined || institutionIds.length > 0),
  });
}

export function useInstitutionComparison() {
  return useQuery({
    queryKey: groupDashboardKeys.institutionComparison(),
    queryFn: () => GroupDashboardService.getInstitutionComparison(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
