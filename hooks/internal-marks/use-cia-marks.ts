import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CiaMarksService } from '@/lib/services/internal-marks/cia-marks-service';
import { academicKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { CiaMarksSyncRequest } from '@/types/internal-marks';
import toast from 'react-hot-toast';

/**
 * Fetches COE course-mapping for a program.
 * Used to derive Semester + Course dropdowns client-side.
 */
export function useCourseMapping(params: {
  institutionId: string | undefined;
  programCode: string | undefined;
}) {
  const { institutionId, programCode } = params;

  return useQuery({
    queryKey: [
      ...academicKeys.internalMarks.all,
      'course-mapping',
      institutionId,
      programCode,
    ],
    queryFn: () =>
      CiaMarksService.getCourseMapping({
        institutionId: institutionId!,
        programCode: programCode!,
      }),
    enabled: !!institutionId && !!programCode,
    ...QUERY_CONFIG.STABLE_DATA, // Program → course structure rarely changes
  });
}

/**
 * Fetches exam registrations from COE.
 * Used to derive course dropdown + student list.
 */
export function useRegistrations(params: {
  institutionId: string | undefined;
  examSessionId: string | undefined;
  programCode: string | undefined;
}) {
  const { institutionId, examSessionId, programCode } = params;

  return useQuery({
    queryKey: [...academicKeys.internalMarks.all, 'registrations', institutionId, examSessionId, programCode],
    queryFn: () => CiaMarksService.getRegistrations({
      institutionId: institutionId!,
      examSessionId: examSessionId!,
      programCode,
    }),
    enabled: !!institutionId && !!examSessionId && !!programCode,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetches existing marks for a course/round.
 */
export function useCiaMarks(params: {
  institutionId: string | undefined;
  examSessionId: string | undefined;
  courseCode: string | undefined;
  ciaRound: number | undefined;
  programCode?: string;
}) {
  const { institutionId, examSessionId, courseCode, ciaRound, programCode } = params;

  return useQuery({
    queryKey: academicKeys.internalMarks.marks.list({ institutionId, examSessionId, courseCode, ciaRound, programCode }),
    queryFn: () => CiaMarksService.getMarks({
      institutionId: institutionId!, examSessionId: examSessionId!,
      courseCode: courseCode!, ciaRound: ciaRound!, programCode,
    }),
    enabled: !!institutionId && !!examSessionId && !!courseCode && ciaRound != null,
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Mutation hook for submitting CIA marks.
 */
export function useSubmitCiaMarks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CiaMarksSyncRequest) => CiaMarksService.syncMarks(data),
    onSuccess: (result) => {
      toast.success(result.message || 'Marks saved successfully');
      queryClient.invalidateQueries({ queryKey: academicKeys.internalMarks.marks.all });
      queryClient.invalidateQueries({ queryKey: academicKeys.internalMarks.report.all });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to save marks'),
  });
}
