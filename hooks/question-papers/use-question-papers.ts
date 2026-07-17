import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { IaPaperService } from '@/lib/services/question-papers/ia-paper-service';
import { academicKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type {
  GeneratePapersDto,
  QuestionPaperListFilters,
  SavePaperDto,
} from '@/types/ia-question-paper';

/** List generated question papers for the current filter selection. */
export function useQuestionPapers(filters: QuestionPaperListFilters, enabled = true) {
  return useQuery({
    queryKey: academicKeys.questionPapers.list(filters as Record<string, unknown>),
    queryFn: () => IaPaperService.listPapers(filters),
    enabled: enabled && !!filters.institutionId && !!filters.examSessionId,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/** Single paper detail (paper + questions + template parts + CO master). */
export function usePaperDetail(id: string | undefined) {
  return useQuery({
    queryKey: academicKeys.questionPapers.detail(id ?? ''),
    queryFn: () => IaPaperService.getPaper(id!),
    enabled: !!id,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/** Active CIA templates for the institution (read-only; designed in the COE app). */
export function useQuestionPaperTemplates(institutionId: string | undefined) {
  return useQuery({
    queryKey: academicKeys.questionPapers.templates(institutionId ?? ''),
    queryFn: () => IaPaperService.listTemplates(institutionId!),
    enabled: !!institutionId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

/**
 * Planned (program, semester) scopes for the exam session's academic year.
 * Gates QP entry so only staff-planned subjects are offered.
 */
export function usePlannedScopes(
  institutionId: string | undefined,
  academicYearId: string | undefined,
  examStartDate: string | undefined
) {
  return useQuery({
    queryKey: [
      ...academicKeys.questionPapers.all,
      'planned-scopes',
      institutionId,
      academicYearId,
      examStartDate,
    ],
    queryFn: () =>
      IaPaperService.listPlannedScopes(institutionId!, academicYearId, examStartDate),
    // Either an explicit academic year OR an exam date (server resolves the year) works.
    enabled: !!institutionId && (!!academicYearId || !!examStartDate),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/** Bulk-scaffold papers from the applicable template. */
export function useGeneratePapers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: GeneratePapersDto) => IaPaperService.generatePapers(dto),
    onSuccess: (result) => {
      const { created, skipped } = result;
      if (created > 0) {
        toast.success(
          `Generated ${created} paper${created === 1 ? '' : 's'}` +
            (skipped > 0 ? ` (${skipped} already existed)` : '')
        );
      } else {
        toast.info(
          skipped > 0
            ? `All ${skipped} papers already exist for this selection`
            : 'No papers were generated — check the template and course offerings'
        );
      }
      queryClient.invalidateQueries({ queryKey: academicKeys.questionPapers.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Save questions / status transition / paper meta. */
export function useSavePaper(paperId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: SavePaperDto) => IaPaperService.savePaper(paperId!, dto),
    onSuccess: (updated) => {
      // Write the server row straight into the detail cache; refresh the list.
      queryClient.setQueryData(academicKeys.questionPapers.detail(paperId ?? ''), updated);
      queryClient.invalidateQueries({ queryKey: academicKeys.questionPapers.list() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Delete a (non-locked) paper. */
export function useDeletePaper() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => IaPaperService.deletePaper(id),
    onSuccess: () => {
      toast.success('Question paper deleted');
      queryClient.invalidateQueries({ queryKey: academicKeys.questionPapers.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
