'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { GroupDashboardService } from '@/lib/services/admission/group-dashboard-service';

export const groupDashboardKeys = {
  all: ['admission-group-dashboard'] as const,
  overview: (
    institutionIds?: string[],
    admissionYearId?: string | null,
    programStartYear?: number | null,
    fromDate?: string | null,
    toDate?: string | null,
  ) =>
    [
      ...groupDashboardKeys.all,
      'overview',
      institutionIds ?? 'all',
      admissionYearId ?? 'no-ay',
      programStartYear ?? 'no-year',
      // 2026-05-21: date-range filter — include in queryKey so React Query
      // refetches on change. NULL on both = no filter (cumulative view).
      fromDate ?? 'no-from',
      toDate ?? 'no-to',
    ] as const,
  seatAnalytics: (institutionId?: string, programStartYear?: number | null) =>
    [
      ...groupDashboardKeys.all,
      'seats',
      institutionId ?? 'all',
      programStartYear ?? 'no-year',
    ] as const,
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
  admittedSourceCounts: (institutionIds?: string[], admissionYear?: number | null) =>
    [
      ...groupDashboardKeys.all,
      'admitted-source-counts',
      institutionIds ?? 'all',
      admissionYear ?? 'no-year',
    ] as const,
  admittedSourceList: (
    institutionIds?: string[],
    admissionYear?: number | null,
    source?: string | null,
    limit?: number,
    offset?: number,
  ) =>
    [
      ...groupDashboardKeys.all,
      'admitted-source-list',
      institutionIds ?? 'all',
      admissionYear ?? 'no-year',
      source ?? 'all-sources',
      limit ?? 50,
      offset ?? 0,
    ] as const,
  institutionComparison: (institutionIds?: string[], admissionYear?: number | null) =>
    [
      ...groupDashboardKeys.all,
      'comparison',
      institutionIds ?? 'all',
      admissionYear ?? 'no-year',
    ] as const,
};

// Invalidates all seat-analytics queries when learners_profiles changes (near-realtime).
// Also listens for billing_student_bills + billing_receipt_items because the
// seat-filled KPI now depends on lifecycle_status='active' which is set by a
// trigger on billing_receipt_items inserts.
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'billing_student_bills' },
        () => {
          queryClient.invalidateQueries({ queryKey: groupDashboardKeys.all });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'billing_receipt_items' },
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
  programStartYear?: number | null,
  // 2026-05-21: ISO date strings ('YYYY-MM-DD') for the optional
  // date-range filter. NULL on both = cumulative (no date filter).
  fromDate?: string | null,
  toDate?: string | null,
) {
  return useQuery({
    queryKey: groupDashboardKeys.overview(
      institutionIds,
      admissionYearId,
      programStartYear,
      fromDate,
      toDate,
    ),
    queryFn: () =>
      GroupDashboardService.getGroupDashboard(
        institutionIds,
        admissionYearId,
        programStartYear,
        fromDate,
        toDate,
      ),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    // Wait until we know which year to query — prevents an all-time fetch
    // before GroupAdmissionYearSelect resolves the default cohort.
    enabled: programStartYear !== null && programStartYear !== undefined,
  });
}

export function useSeatAnalytics(
  institutionId?: string,
  programStartYear?: number | null
) {
  useSeatsRealtimeInvalidation();
  return useQuery({
    queryKey: groupDashboardKeys.seatAnalytics(institutionId, programStartYear),
    queryFn: () => GroupDashboardService.getSeatAnalytics(institutionId, programStartYear),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    // Wait until a year is selected if it's expected to be set; allow null/undefined
    // for the "active-only default" path.
    enabled: programStartYear === undefined || programStartYear === null
      ? true
      : Number.isFinite(programStartYear),
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

/**
 * Per-source admitted counts for the drill-down's filter chips + donut.
 * Includes the DIRECT_SOURCE_KEY bucket (admitted learners with no lead).
 */
export function useAdmittedSourceCounts(
  institutionIds: string[] | undefined,
  admissionYear: number | null
) {
  useSeatsRealtimeInvalidation();
  return useQuery({
    queryKey: groupDashboardKeys.admittedSourceCounts(institutionIds, admissionYear),
    queryFn: () =>
      GroupDashboardService.getAdmittedSourceCounts(institutionIds, admissionYear),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled:
      admissionYear !== null && admissionYear !== undefined
      && (institutionIds === undefined || institutionIds.length > 0),
  });
}

/**
 * Paginated admitted-learner list with source attribution.
 *
 * `source` semantics: null => all sources; DIRECT_SOURCE_KEY => only learners
 * with no lead row; anything else => that exact admission_leads.source value.
 *
 * placeholderData keeps the previous page visible while the next one loads, so
 * paging doesn't flash an empty table.
 */
export function useAdmittedSourceList(
  institutionIds: string[] | undefined,
  admissionYear: number | null,
  source: string | null,
  limit: number,
  offset: number
) {
  return useQuery({
    queryKey: groupDashboardKeys.admittedSourceList(
      institutionIds,
      admissionYear,
      source,
      limit,
      offset,
    ),
    queryFn: () =>
      GroupDashboardService.getAdmittedSourceBreakdown(
        institutionIds,
        admissionYear,
        source,
        limit,
        offset,
      ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
    enabled:
      admissionYear !== null && admissionYear !== undefined
      && (institutionIds === undefined || institutionIds.length > 0),
  });
}

export function useInstitutionComparison(
  institutionIds: string[] | undefined,
  admissionYear: number | null
) {
  useSeatsRealtimeInvalidation();
  return useQuery({
    queryKey: groupDashboardKeys.institutionComparison(institutionIds, admissionYear),
    queryFn: () => GroupDashboardService.getInstitutionComparison(institutionIds, admissionYear),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled:
      admissionYear !== null && admissionYear !== undefined
      && (institutionIds === undefined || institutionIds.length > 0),
  });
}
