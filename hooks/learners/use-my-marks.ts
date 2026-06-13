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
  resultView: () => [...myMarksKeys.all, 'result-view'] as const,
  ciaView: () => [...myMarksKeys.all, 'cia-view'] as const,
};

export function useMyMarksRegistrations() {
  return useQuery({
    queryKey: myMarksKeys.registrations(),
    queryFn: () => MyMarksService.getRegistrations(),
    ...QUERY_CONFIG.STABLE_DATA,
    // Scale guard: never retry on failure (the routes fail-soft on 429 already);
    // a retry here would only add load to the shared COE key under contention.
    retry: 0,
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
    // Scale guards: no retry (route fail-softs on 429) and no refetch-on-mount
    // churn — this is the query that was storming under load.
    retry: 0,
    refetchOnMount: false,
  });
}

export function useMyMarksResultView() {
  return useQuery({
    queryKey: myMarksKeys.resultView(),
    queryFn: () => MyMarksService.getResultView(),
    // Single aggregate call; stable + no retry/refetch churn (route fail-softs 429).
    ...QUERY_CONFIG.STABLE_DATA,
    retry: 0,
    refetchOnMount: false,
  });
}

export function useMyMarksCiaView() {
  return useQuery({
    queryKey: myMarksKeys.ciaView(),
    queryFn: () => MyMarksService.getCiaView(),
    // CIA marks change during entry windows but a single cached call per ~couple
    // minutes is plenty; no retry/refetch churn (route fail-softs on 429).
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
    retry: 0,
    refetchOnMount: false,
  });
}

export function useMyMarksGradeSystem() {
  return useQuery({
    queryKey: myMarksKeys.gradeSystem(),
    queryFn: () => MyMarksService.getGradeSystem(),
    // Grade bands are institution reference data — they almost never change.
    ...QUERY_CONFIG.STABLE_DATA,
    // Scale guard: never retry (route fail-softs on 429).
    retry: 0,
  });
}
