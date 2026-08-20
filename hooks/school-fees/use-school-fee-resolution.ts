// hooks/school-fees/use-school-fee-resolution.ts
//
// DYNAMIC_DATA tier, not SEMI_STABLE: a resolution changes the moment a
// concession is assigned or a plan is edited, and a clerk who just granted a
// waiver expects the preview to reflect it immediately.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { SchoolFeeResolutionService } from '@/lib/services/school-fees/school-fee-resolution-service';
import type { ClassFeePreviewRow, SchoolFeeResolution } from '@/types/school-fees';

export const SCHOOL_FEE_RESOLUTION_KEYS = {
  all: ['school-fee-resolution'] as const,
  learner: (learnerId?: string) => ['school-fee-resolution', 'learner', learnerId] as const,
  class: (institutionId?: string, programId?: string, academicYearId?: string) =>
    ['school-fee-resolution', 'class', institutionId, programId, academicYearId] as const,
};

export function useSchoolFeeResolution(learnerId?: string) {
  const query = useQuery({
    queryKey: SCHOOL_FEE_RESOLUTION_KEYS.learner(learnerId),
    queryFn: () => SchoolFeeResolutionService.resolveForLearner(learnerId!),
    enabled: Boolean(learnerId),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  const resolution = (query.data ?? null) as SchoolFeeResolution | null;

  return {
    resolution,
    matched: resolution?.matched ?? false,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}

export function useSchoolFeeClassPreview(
  institutionId?: string,
  programId?: string,
  academicYearId?: string,
) {
  const query = useQuery({
    queryKey: SCHOOL_FEE_RESOLUTION_KEYS.class(institutionId, programId, academicYearId),
    queryFn: () =>
      SchoolFeeResolutionService.previewForClass(institutionId!, programId!, academicYearId!),
    enabled: Boolean(institutionId && programId && academicYearId),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  const rows: ClassFeePreviewRow[] = useMemo(() => query.data ?? [], [query.data]);

  const summary = useMemo(() => {
    const matched = rows.filter((r) => r.matched);
    return {
      learners: rows.length,
      matched: matched.length,
      unmatched: rows.length - matched.length,
      withConcession: matched.filter((r) => r.concession_count > 0).length,
      gross: matched.reduce((s, r) => s + r.year_gross, 0),
      concession: matched.reduce((s, r) => s + r.year_concession, 0),
      net: matched.reduce((s, r) => s + r.year_net, 0),
    };
  }, [rows]);

  return {
    rows,
    summary,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
  };
}
