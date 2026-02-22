'use client';

import { useQuery } from '@tanstack/react-query';
import { NAACReportService } from '@/lib/services/admission/naac-report-service';

export const naacKeys = {
  all: ['naac-report'] as const,
  enrollment: (institutionId?: string) =>
    [...naacKeys.all, 'enrollment', institutionId || 'all'] as const,
};

export function useNAACEnrollmentReport(institutionId?: string) {
  return useQuery({
    queryKey: naacKeys.enrollment(institutionId),
    queryFn: () => NAACReportService.generateEnrollmentReport(institutionId),
    staleTime: 10 * 60 * 1000,
  });
}
