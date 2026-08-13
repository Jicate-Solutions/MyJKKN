import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MarkEntryService, type PaperLookupParams } from '@/lib/services/mark-entry/mark-entry-service';
import { academicKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { QuestionMarkSaveRequest, QuestionMarkSaveResponse } from '@/types/mark-entry';

/**
 * Resolves the question paper for the current course + round.
 *
 * SEMI_STABLE_DATA: a paper changes only when someone re-authors it, but it is
 * not immutable (a draft paper can gain questions mid-entry), so it should not
 * be cached as aggressively as a master list.
 */
export function useMarkEntryPaper(params: PaperLookupParams, enabled = true) {
  return useQuery({
    queryKey: academicKeys.markEntry.paper(params as Record<string, unknown>),
    queryFn: () => MarkEntryService.fetchPaper(params),
    enabled:
      enabled &&
      !!params.institutionId &&
      !!params.examSessionId &&
      params.ciaRound != null &&
      !!params.courseCode,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Saves question-wise marks.
 *
 * Note the absence of a query invalidation: saved `question_marks` cannot be read
 * back through v1 (the report endpoint emits only the 13 component codes), so
 * there is no server state to refetch. The grid's own state plus the local draft
 * are the source of truth for the session.
 *
 * `onSuccess` fires for partial writes too (HTTP 207) — the caller MUST branch on
 * `result.success` and keep the draft when it is false.
 */
export function useSaveQuestionMarks() {
  return useMutation<QuestionMarkSaveResponse, Error, QuestionMarkSaveRequest>({
    mutationFn: (request) => MarkEntryService.saveMarks(request),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message ?? 'Marks saved');
      } else {
        toast.error(result.message ?? 'Some learners failed to save', {
          description: result.details?.length
            ? `${result.details.length} learner(s) affected`
            : undefined,
          duration: 10000,
        });
      }
    },
    onError: (e) => toast.error(e.message),
  });
}
