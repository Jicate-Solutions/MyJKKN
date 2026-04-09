import { useQuery, useQueries } from '@tanstack/react-query';
import { CiaReportService } from '@/lib/services/internal-marks/cia-report-service';
import { academicKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { CiaReportResponse } from '@/types/internal-marks';

export function useCiaReport(params: {
  institutionId: string | undefined;
  examSessionId: string | undefined;
  courseCode: string | undefined;
  ciaRound: number | undefined;
  programCode?: string;
}) {
  const { institutionId, examSessionId, courseCode, ciaRound, programCode } = params;

  return useQuery({
    queryKey: academicKeys.internalMarks.report.detail({ institutionId, examSessionId, courseCode, ciaRound, programCode }),
    queryFn: () => CiaReportService.getReport({
      institutionId: institutionId!, examSessionId: examSessionId!,
      courseCode: courseCode!, ciaRound: ciaRound!, programCode,
    }),
    enabled: !!institutionId && !!examSessionId && !!courseCode && ciaRound != null,
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetches CIA report data for MULTIPLE courses in parallel.
 * Used by the consolidated report and course-wise PDF export.
 */
export function useMultiCiaReport(params: {
  institutionId: string | undefined;
  examSessionId: string | undefined;
  courseCodes: string[];
  ciaRound: number | undefined;
  programCode?: string;
}) {
  const { institutionId, examSessionId, courseCodes, ciaRound, programCode } = params;
  const enabled = !!institutionId && !!examSessionId && ciaRound != null;

  const queries = useQueries({
    queries: courseCodes.map((courseCode) => ({
      queryKey: academicKeys.internalMarks.report.detail({
        institutionId,
        examSessionId,
        courseCode,
        ciaRound,
        programCode,
      }),
      queryFn: () =>
        CiaReportService.getReport({
          institutionId: institutionId!,
          examSessionId: examSessionId!,
          courseCode,
          ciaRound: ciaRound!,
          programCode,
        }),
      enabled,
      ...QUERY_CONFIG.DYNAMIC_DATA,
    })),
  });

  const data = queries
    .map((q, i) => ({ courseCode: courseCodes[i], data: q.data }))
    .filter((x): x is { courseCode: string; data: CiaReportResponse } => !!x.data);
  const isLoading = queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const isError = queries.some((q) => q.isError);

  return { data, isLoading, isFetching, isError };
}
