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
  sourceAnalytics: (institutionId?: string) =>
    [...groupDashboardKeys.all, 'sources', institutionId ?? 'all'] as const,
  geographyAnalytics: (institutionId?: string) =>
    [...groupDashboardKeys.all, 'geography', institutionId ?? 'all'] as const,
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

export function useSourceAnalytics(institutionId?: string) {
  return useQuery({
    queryKey: groupDashboardKeys.sourceAnalytics(institutionId),
    queryFn: () => GroupDashboardService.getSourceAnalytics(institutionId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useGeographyAnalytics(institutionId?: string) {
  return useQuery({
    queryKey: groupDashboardKeys.geographyAnalytics(institutionId),
    queryFn: () => GroupDashboardService.getGeographyAnalytics(institutionId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
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
