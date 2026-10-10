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
  semester?: number;
}) {
  const { institutionId, examSessionId, courseCode, ciaRound, programCode, semester } = params;

  return useQuery({
    queryKey: academicKeys.internalMarks.report.detail({ institutionId, examSessionId, courseCode, ciaRound, programCode, semester }),
    queryFn: () => CiaReportService.getReport({
      institutionId: institutionId!, examSessionId: examSessionId!,
      courseCode: courseCode!, ciaRound: ciaRound!, programCode, semester,
    }),
    enabled: !!institutionId && !!examSessionId && !!courseCode && ciaRound != null,
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetches CIA report data for MULTIPLE courses in parallel.
 * Used by the consolidated report and course-wise PDF export.
 *
 * Each entry is a course in ONE semester: the same course code under two
 * semesters is two reports, never one merged list.
 */
export function useMultiCiaReport(params: {
  institutionId: string | undefined;
  examSessionId: string | undefined;
  courses: Array<{ courseCode: string; semester?: number }>;
  ciaRound: number | undefined;
  programCode?: string;
}) {
  const { institutionId, examSessionId, courses, ciaRound, programCode } = params;
  const enabled = !!institutionId && !!examSessionId && ciaRound != null;

  const queries = useQueries({
    queries: courses.map(({ courseCode, semester }) => ({
      queryKey: academicKeys.internalMarks.report.detail({
        institutionId,
        examSessionId,
        courseCode,
        ciaRound,
        programCode,
        semester,
      }),
      queryFn: () =>
        CiaReportService.getReport({
          institutionId: institutionId!,
          examSessionId: examSessionId!,
          courseCode,
          ciaRound: ciaRound!,
          programCode,
          semester,
        }),
      enabled,
      ...QUERY_CONFIG.DYNAMIC_DATA,
    })),
  });

  const data = queries
    .map((q, i) => ({ ...courses[i], data: q.data }))
    .filter(
      (x): x is { courseCode: string; semester: number | undefined; data: CiaReportResponse } =>
        !!x.data
    );
  const isLoading = queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const isError = queries.some((q) => q.isError);

  return { data, isLoading, isFetching, isError };
}
