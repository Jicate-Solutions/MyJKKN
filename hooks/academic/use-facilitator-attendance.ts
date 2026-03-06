// hooks/academic/use-facilitator-attendance.ts
// Created: 2026-03-06

import { useQuery } from '@tanstack/react-query';
import { FacilitatorAttendanceService } from '@/lib/services/academic/facilitator-attendance-service';
import type { FacilitatorReportFilters } from '@/types/attendance';

const QUERY_KEYS = {
  all: ['facilitator-attendance-report'] as const,
  report: (institutionId: string, filters: FacilitatorReportFilters) =>
    [...QUERY_KEYS.all, institutionId, filters] as const,
};

export function useFacilitatorAttendanceReport(
  institutionId: string | null | undefined,
  filters: FacilitatorReportFilters,
  enabled = true
) {
  return useQuery({
    queryKey: QUERY_KEYS.report(institutionId ?? '', filters),
    queryFn: () =>
      FacilitatorAttendanceService.getReport(institutionId!, filters),
    enabled: enabled && !!institutionId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
