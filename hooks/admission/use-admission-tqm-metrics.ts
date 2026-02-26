'use client';

import { useQuery } from '@tanstack/react-query';
import { AdmissionTQMMetricsService } from '@/lib/services/admission/admission-tqm-metrics-service';

export const admissionTQMKeys = {
  all: ['admission-tqm'] as const,
  metrics: (institutionId: string) =>
    [...admissionTQMKeys.all, 'metrics', institutionId] as const,
  stageDurations: (institutionId: string) =>
    [...admissionTQMKeys.all, 'stage-durations', institutionId] as const,
};

/**
 * Hook for fetching admission TQM metrics for the Process Excellence dashboard widget.
 * Returns current month metrics, previous month for comparison, and COPQ summary.
 */
export function useAdmissionTQMMetrics(institutionId: string | undefined) {
  return useQuery({
    queryKey: admissionTQMKeys.metrics(institutionId || ''),
    queryFn: () => AdmissionTQMMetricsService.getMetrics(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook for stage duration breakdown (bottleneck analysis).
 */
export function useAdmissionStageDurations(institutionId: string | undefined) {
  return useQuery({
    queryKey: admissionTQMKeys.stageDurations(institutionId || ''),
    queryFn: () => AdmissionTQMMetricsService.getStageDurations(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });
}
