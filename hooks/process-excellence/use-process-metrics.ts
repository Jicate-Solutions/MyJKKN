'use client';

import { useQuery } from '@tanstack/react-query';
import { ProcessExcellenceService } from '@/lib/services/process-excellence/process-excellence-service';
import type {
  ProcessMetricsFilters,
  ProcessCategory
} from '@/types/process-excellence';

// Query keys
export const processMetricsKeys = {
  all: ['process-metrics'] as const,
  metrics: (filters: ProcessMetricsFilters) =>
    [...processMetricsKeys.all, 'list', filters] as const,
  dashboard: (institutionId: string) =>
    [...processMetricsKeys.all, 'dashboard', institutionId] as const
};

// Hook for fetching process metrics
export function useProcessMetrics(filters: ProcessMetricsFilters) {
  return useQuery({
    queryKey: processMetricsKeys.metrics(filters),
    queryFn: () => ProcessExcellenceService.getProcessMetrics(filters),
    enabled: !!filters.institution_id,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

/**
 * Hook for fetching dashboard data
 * FIXED: Removed aggressive auto-refresh, use manual refetch instead
 */
export function useProcessExcellenceDashboard(institutionId: string) {
  return useQuery({
    queryKey: processMetricsKeys.dashboard(institutionId),
    queryFn: () => ProcessExcellenceService.getDashboard(institutionId),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true // Refresh when user returns to tab
  });
}

// Hook for metrics by category
export function useProcessMetricsByCategory(
  institutionId: string,
  category: ProcessCategory
) {
  return useQuery({
    queryKey: [...processMetricsKeys.all, 'category', institutionId, category],
    queryFn: () =>
      ProcessExcellenceService.getProcessMetrics({
        institution_id: institutionId,
        category
      }),
    enabled: !!institutionId && !!category,
    staleTime: 5 * 60 * 1000
  });
}

// Hook for metrics for a specific process
export function useProcessMetricsForProcess(
  institutionId: string,
  processId: string
) {
  return useQuery({
    queryKey: [...processMetricsKeys.all, 'process', institutionId, processId],
    queryFn: () =>
      ProcessExcellenceService.getProcessMetrics({
        institution_id: institutionId,
        process_id: processId
      }),
    enabled: !!institutionId && !!processId,
    staleTime: 5 * 60 * 1000,
    select: (data) => data[0] // Return single metric
  });
}

// Hook for metrics within a date range
export function useProcessMetricsForPeriod(
  institutionId: string,
  periodStart: string,
  periodEnd: string
) {
  return useQuery({
    queryKey: [
      ...processMetricsKeys.all,
      'period',
      institutionId,
      periodStart,
      periodEnd
    ],
    queryFn: () =>
      ProcessExcellenceService.getProcessMetrics({
        institution_id: institutionId,
        period_start: periodStart,
        period_end: periodEnd
      }),
    enabled: !!institutionId && !!periodStart && !!periodEnd,
    staleTime: 5 * 60 * 1000
  });
}
