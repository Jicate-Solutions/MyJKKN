'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { GroupDashboardService } from '@/lib/services/admission/group-dashboard-service';

export const groupDashboardKeys = {
  all: ['admission-group-dashboard'] as const,
  overview: (institutionIds?: string[]) =>
    [...groupDashboardKeys.all, 'overview', institutionIds ?? 'all'] as const,
  duplicates: () => [...groupDashboardKeys.all, 'duplicates'] as const,
  seatAnalytics: (institutionId?: string, academicYearId?: string) =>
    [...groupDashboardKeys.all, 'seats', institutionId ?? 'all', academicYearId ?? 'all'] as const,
  sourceAnalytics: (institutionId?: string, academicYearId?: string) =>
    [...groupDashboardKeys.all, 'sources', institutionId ?? 'all', academicYearId ?? 'all'] as const,
  geographyAnalytics: (institutionId?: string, academicYearId?: string) =>
    [...groupDashboardKeys.all, 'geography', institutionId ?? 'all', academicYearId ?? 'all'] as const,
  institutionComparison: (academicYearId?: string) =>
    [...groupDashboardKeys.all, 'comparison', academicYearId ?? 'all'] as const,
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

export function useGroupDashboard(institutionIds?: string[]) {
  return useQuery({
    queryKey: groupDashboardKeys.overview(institutionIds),
    queryFn: () => GroupDashboardService.getGroupDashboard(institutionIds),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useCrossCampusDuplicates() {
  return useQuery({
    queryKey: groupDashboardKeys.duplicates(),
    queryFn: () => GroupDashboardService.findCrossCampusDuplicates(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useSeatAnalytics(institutionId?: string, academicYearId?: string) {
  useSeatsRealtimeInvalidation();
  return useQuery({
    queryKey: groupDashboardKeys.seatAnalytics(institutionId, academicYearId),
    queryFn: () => GroupDashboardService.getSeatAnalytics(institutionId, academicYearId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useSourceAnalytics(institutionId?: string, academicYearId?: string) {
  return useQuery({
    queryKey: groupDashboardKeys.sourceAnalytics(institutionId, academicYearId),
    queryFn: () => GroupDashboardService.getSourceAnalytics(institutionId, academicYearId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useGeographyAnalytics(institutionId?: string, academicYearId?: string) {
  return useQuery({
    queryKey: groupDashboardKeys.geographyAnalytics(institutionId, academicYearId),
    queryFn: () => GroupDashboardService.getGeographyAnalytics(institutionId, academicYearId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useInstitutionComparison(academicYearId?: string) {
  return useQuery({
    queryKey: groupDashboardKeys.institutionComparison(academicYearId),
    queryFn: () => GroupDashboardService.getInstitutionComparison(academicYearId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
