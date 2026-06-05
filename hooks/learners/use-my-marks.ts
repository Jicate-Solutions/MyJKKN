/**
 * React Query hooks for the student "My Marks" portal.
 *
 * - useMyMarksRegistrations: STABLE_DATA (settings cache for 5min) — registrations don't churn.
 * - useMyMarksCiaSettings:   SEMI_STABLE_DATA — settings change occasionally as faculty configure.
 * - useMyMarksReport:        DYNAMIC_DATA — marks update during entry windows.
 * - useMyMarksInternalFinal: STABLE_DATA — Phase 1 stub returns constant.
 */

import { useQuery } from '@tanstack/react-query';
import { MyMarksService } from '@/lib/services/learners/my-marks-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export const myMarksKeys = {
  all: ['my-marks'] as const,
  registrations: () => [...myMarksKeys.all, 'registrations'] as const,
  ciaSettings: (examSessionId: string, programCode: string) =>
    [...myMarksKeys.all, 'cia-settings', examSessionId, programCode] as const,
  report: (examSessionId: string, courseCode: string, ciaRound: number, programCode: string) =>
    [
      ...myMarksKeys.all,
      'report',
      examSessionId,
      courseCode,
      ciaRound,
      programCode,
    ] as const,
  internalFinal: () => [...myMarksKeys.all, 'internal-final'] as const,
  result: (examSessionId: string) =>
    [...myMarksKeys.all, 'result', examSessionId] as const,
  gradeSystem: () => [...myMarksKeys.all, 'grade-system'] as const,
};

export function useMyMarksRegistrations() {
  return useQuery({
    queryKey: myMarksKeys.registrations(),
    queryFn: () => MyMarksService.getRegistrations(),
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useMyMarksCiaSettings(
  examSessionId: string | undefined,
  programCode: string | undefined
) {
  return useQuery({
    queryKey: myMarksKeys.ciaSettings(examSessionId ?? '', programCode ?? ''),
    queryFn: () =>
      MyMarksService.getCiaSettings({
        examSessionId: examSessionId!,
        programCode: programCode!,
      }),
    enabled: !!examSessionId && !!programCode,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useMyMarksReport(params: {
  examSessionId: string | undefined;
  courseCode: string | undefined;
  ciaRound: number | undefined;
  programCode: string | undefined;
}) {
  const { examSessionId, courseCode, ciaRound, programCode } = params;
  return useQuery({
    queryKey: myMarksKeys.report(
      examSessionId ?? '',
      courseCode ?? '',
      ciaRound ?? 0,
      programCode ?? ''
    ),
    queryFn: () =>
      MyMarksService.getMarks({
        examSessionId: examSessionId!,
        courseCode: courseCode!,
        ciaRound: ciaRound!,
        programCode: programCode!,
      }),
    enabled:
      !!examSessionId && !!courseCode && !!ciaRound && !!programCode,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useMyMarksInternalFinal() {
  return useQuery({
    queryKey: myMarksKeys.internalFinal(),
    queryFn: () => MyMarksService.getInternalFinal(),
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useMyMarksResult(examSessionId: string | undefined) {
  return useQuery({
    queryKey: myMarksKeys.result(examSessionId ?? ''),
    queryFn: () => MyMarksService.getResult({ examSessionId: examSessionId! }),
    enabled: !!examSessionId,
    // Published results are stable; before publish the empty response is cheap
    // to re-check, so semi-stable strikes the right balance.
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useMyMarksGradeSystem() {
  return useQuery({
    queryKey: myMarksKeys.gradeSystem(),
    queryFn: () => MyMarksService.getGradeSystem(),
    // Grade bands are institution reference data — they almost never change.
    ...QUERY_CONFIG.STABLE_DATA,
  });
}
