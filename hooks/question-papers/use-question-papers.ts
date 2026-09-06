import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { IaPaperService } from '@/lib/services/question-papers/ia-paper-service';
import { academicKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { PaperSaveError } from '@/types/ia-question-paper';
import type {
  GeneratePapersDto,
  IaQuestionPaperDetail,
  QuestionPaperListFilters,
  SavePaperDto,
} from '@/types/ia-question-paper';

/** Query key for one course's CO master. */
const courseOutcomeKey = (courseId: string) =>
  [...academicKeys.questionPapers.all, 'course-outcomes', courseId] as const;

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

/**
 * Save questions / status transition / paper meta.
 *
 * Handles COE's mass-clear guard inline: a save that would take 3+ questions from
 * authored to empty is refused with 409 WOULD_CLEAR rather than silently wiping
 * them. That is almost always a stale tab or a bad merge, so we surface COE's own
 * sentence (which names the questions) and only retry when the author confirms
 * they meant it. One or two cleared questions is plausible hand-editing and passes
 * without a prompt.
 */
export function useSavePaper(paperId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: SavePaperDto) => {
      try {
        return await IaPaperService.savePaper(paperId!, dto);
      } catch (e) {
        if (
          e instanceof PaperSaveError &&
          e.code === 'WOULD_CLEAR' &&
          !dto.allow_clear &&
          typeof window !== 'undefined' &&
          window.confirm(e.message)
        ) {
          return IaPaperService.savePaper(paperId!, { ...dto, allow_clear: true });
        }
        throw e;
      }
    },
    onSuccess: (updated) => {
      // MERGE into the detail cache — the save response carries questions/status/
      // updated_at but NOT template_parts/course_outcomes (GET-only), so a full
      // replace would blank the authoring grid's parts and CO options.
      queryClient.setQueryData(
        academicKeys.questionPapers.detail(paperId ?? ''),
        (prev: IaQuestionPaperDetail | undefined) =>
          prev ? { ...prev, ...updated } : updated
      );
      queryClient.invalidateQueries({ queryKey: academicKeys.questionPapers.list() });
    },
    onError: (e: Error) => {
      const code = e instanceof PaperSaveError ? e.code : undefined;
      if (code === 'CONFLICT') {
        // Never destroy the author's edits over a conflict — tell them to reopen
        // the paper so they re-enter against the current version deliberately.
        toast.error('Not saved — paper changed elsewhere', {
          description:
            'Reopen this paper to get the latest version, then re-enter your changes.',
        });
      } else if (code === 'WOULD_CLEAR') {
        // Reached only when the author declined the confirm — nothing was written.
        toast.info('Nothing was saved — your authored questions are untouched.');
      } else if (code === 'INCOMPLETE' || code === 'SUB_MARKS') {
        // The UI runs the same pure validators, so this is the stale-tab path.
        toast.error('Paper is not ready', { description: e.message });
      } else {
        toast.error(e.message);
      }
    },
  });
}

// ── Course outcomes master ─────────────────────────────────────────────────

/**
 * COs for a course. Kept separate from the paper detail so adding one refreshes
 * the dropdowns WITHOUT refetching the paper — a paper refetch would push a new
 * `questions` array into the cache mid-authoring.
 */
export function useCourseOutcomes(courseId: string | undefined) {
  return useQuery({
    queryKey: courseOutcomeKey(courseId ?? ''),
    queryFn: () => IaPaperService.listCourseOutcomes(courseId!),
    enabled: !!courseId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useAddCourseOutcomes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof IaPaperService.addCourseOutcomes>[0]) =>
      IaPaperService.addCourseOutcomes(body),
    onSuccess: (_data, body) => {
      toast.success(
        body.outcomes?.length
          ? `Added ${body.outcomes.length} course outcomes`
          : `Added ${body.co_code}`
      );
      queryClient.invalidateQueries({ queryKey: courseOutcomeKey(body.course_id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCourseOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; courseId: string }) =>
      IaPaperService.deleteCourseOutcome(id),
    onSuccess: (_data, { courseId }) => {
      queryClient.invalidateQueries({ queryKey: courseOutcomeKey(courseId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Approve one or more papers (bulk or individual). Each is an independent PUT
 * status='approved'; partial failures are tolerated and summarised. Approving
 * locks the paper's questions from further edits (enforced COE-side).
 */
export function useApprovePapers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (papers: { id: string; base_updated_at?: string }[]) => {
      const results = await Promise.allSettled(
        papers.map((p) =>
          IaPaperService.savePaper(p.id, { status: 'approved', base_updated_at: p.base_updated_at })
        )
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      return { ok, fail: results.length - ok };
    },
    onSuccess: ({ ok, fail }) => {
      if (ok > 0) toast.success(`Approved ${ok} paper${ok === 1 ? '' : 's'}${fail ? `, ${fail} failed` : ''}`);
      else if (fail > 0) toast.error(`Could not approve ${fail} paper${fail === 1 ? '' : 's'}`);
      queryClient.invalidateQueries({ queryKey: academicKeys.questionPapers.all });
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
