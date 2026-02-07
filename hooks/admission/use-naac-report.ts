'use client';

import { useQuery } from '@tanstack/react-query';
import { NAACReportService } from '@/lib/services/admission/naac-report-service';

export const naacKeys = {
  all: ['naac-report'] as const,
  enrollment: (institutionId?: string, years?: string[]) =>
    [...naacKeys.all, 'enrollment', institutionId || 'all', ...(years || [])] as const,
};

export function useNAACEnrollmentReport(
  institutionId?: string,
  years?: string[]
) {
  return useQuery({
    queryKey: naacKeys.enrollment(institutionId, years),
    queryFn: () => NAACReportService.generateEnrollmentReport(institutionId, years),
    staleTime: 10 * 60 * 1000,
  });
}
