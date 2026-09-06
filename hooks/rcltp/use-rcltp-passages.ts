/**
 * EKSAQ RCLTP — Passages domain hooks (Phase B) · REFERENCE PATTERN
 * ----------------------------------------------------------------------------
 * Canonical React Query pattern for the rcltp layer:
 *   - a `*Keys` factory for stable, filter-aware query keys
 *   - reads: useQuery + a QUERY_CONFIG preset + placeholderData for smooth paging
 *   - staff/admin mutations: call the service method directly (MyJKKN convention)
 *     and invalidate the relevant key tree on success
 *   - student-affecting mutations are intentionally absent here — they post to
 *     server-side routes (Phase C); the service stubs throw if called client-side.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { RcltpPassagesService } from '@/lib/services/rcltp/passages-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type {
  RcltpPassageFilters,
  RcltpPartBQuestionFilters,
  RcltpPassageExposureFilters,
  CreateRcltpPassageDto,
  UpdateRcltpPassageDto,
  CreateRcltpPartBQuestionDto,
  UpdateRcltpPartBQuestionDto,
  UpdateRcltpQuestionReviewDto,
} from '@/types/rcltp';

export const rcltpPassageKeys = {
  all: ['rcltp', 'passages'] as const,
  lists: () => [...rcltpPassageKeys.all, 'list'] as const,
  list: (filters: RcltpPassageFilters) =>
    [...rcltpPassageKeys.lists(), filters] as const,
  detail: (id: string) => [...rcltpPassageKeys.all, 'detail', id] as const,
};

export const rcltpQuestionKeys = {
  all: ['rcltp', 'questions'] as const,
  list: (filters: RcltpPartBQuestionFilters) =>
    [...rcltpQuestionKeys.all, 'list', filters] as const,
};

export const rcltpExposureKeys = {
  all: ['rcltp', 'exposure'] as const,
  list: (filters: RcltpPassageExposureFilters) =>
    [...rcltpExposureKeys.all, 'list', filters] as const,
};

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

export function useRcltpPassages(filters: RcltpPassageFilters = {}) {
  return useQuery({
    queryKey: rcltpPassageKeys.list(filters),
    queryFn: () => RcltpPassagesService.getPassages(filters),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useRcltpPassage(id: string) {
  return useQuery({
    queryKey: rcltpPassageKeys.detail(id),
    queryFn: () => RcltpPassagesService.getPassageById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useRcltpQuestions(filters: RcltpPartBQuestionFilters = {}) {
  return useQuery({
    queryKey: rcltpQuestionKeys.list(filters),
    queryFn: () => RcltpPassagesService.getQuestions(filters),
    // Never fetch with an empty filter: an un-scoped query returns arbitrary
    // tenant questions (incl. drafts) to the network. Callers always pass a
    // passage_id; gate on it so a passage-less render makes no request.
    enabled: !!filters.passage_id,
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Learner-safe questions read for the take-the-assessment flow. Uses the SECURITY
 * DEFINER RPC (answer key omitted) instead of a base-table select. Never use
 * useRcltpQuestions in a learner surface — it puts correct_answer on the wire.
 */
export function useRcltpQuestionsForTake(passageId: string) {
  return useQuery({
    queryKey: [...rcltpQuestionKeys.all, 'for-take', passageId] as const,
    queryFn: () => RcltpPassagesService.getQuestionsForTake(passageId),
    enabled: !!passageId,
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useRcltpPassageExposure(filters: RcltpPassageExposureFilters = {}) {
  return useQuery({
    queryKey: rcltpExposureKeys.list(filters),
    queryFn: () => RcltpPassagesService.getExposure(filters),
    enabled: !!(filters.learner_id || filters.passage_id),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ---------------------------------------------------------------------------
// STAFF / ADMIN MUTATIONS (direct service calls — RLS permits these writes)
// ---------------------------------------------------------------------------

export function useCreateRcltpPassage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRcltpPassageDto) =>
      RcltpPassagesService.createPassage(input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpPassageKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to create passage'),
  });
}

export function useUpdateRcltpPassage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRcltpPassageDto }) =>
      RcltpPassagesService.updatePassage(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpPassageKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to update passage'),
  });
}

export function useDeleteRcltpPassage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => RcltpPassagesService.deletePassage(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpPassageKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to delete passage'),
  });
}

export function useCreateRcltpQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRcltpPartBQuestionDto) =>
      RcltpPassagesService.createQuestion(input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpQuestionKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to create question'),
  });
}

export function useUpdateRcltpQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateRcltpPartBQuestionDto;
    }) => RcltpPassagesService.updateQuestion(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpQuestionKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to update question'),
  });
}

export function useDeleteRcltpQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => RcltpPassagesService.deleteQuestion(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpQuestionKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to delete question'),
  });
}

// Question review (D6): staff approves/retires an AI-generated question.
export function useReviewRcltpQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateRcltpQuestionReviewDto;
    }) => RcltpPassagesService.reviewQuestion(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpQuestionKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to save question review'),
  });
}

// ---------------------------------------------------------------------------
// REVIEW QUEUE — batch approve, most-needed-first order, weekly spot-check
// (locked decisions #1, #5, #7)
// ---------------------------------------------------------------------------

export const rcltpReviewKeys = {
  all: ['rcltp', 'review'] as const,
  priority: (institutionId: string | null) =>
    [...rcltpReviewKeys.all, 'priority', institutionId] as const,
  spotcheck: () => [...rcltpReviewKeys.all, 'spotcheck', 'week'] as const,
};

/** Batch-promote the AI-agreed drafts of a passage in one statement. */
export function useReviewRcltpQuestionsBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ids,
      input,
    }: {
      ids: string[];
      input: UpdateRcltpQuestionReviewDto;
    }) => RcltpPassagesService.reviewQuestionsBulk(ids, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rcltpQuestionKeys.all });
      // A batch approve changes both the pile order and next week's sample pool.
      qc.invalidateQueries({ queryKey: rcltpReviewKeys.all });
    },
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to approve the selected questions'),
  });
}

/** Most-needed-first ordering for the passage list. */
export function useRcltpPassageReviewPriority(institutionId: string | null) {
  return useQuery({
    queryKey: rcltpReviewKeys.priority(institutionId),
    queryFn: () => RcltpPassagesService.getPassageReviewPriority(institutionId),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/** This week's enforced spot-check sample for the signed-in Senior Learner. */
export function useRcltpSpotcheckWeek() {
  return useQuery({
    queryKey: rcltpReviewKeys.spotcheck(),
    queryFn: () => RcltpPassagesService.getSpotcheckWeek(),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/** Record the outcome of one sampled item. */
export function useResolveRcltpSpotcheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: 'confirmed' | 'flagged';
      note?: string | null;
    }) => RcltpPassagesService.resolveSpotcheck(id, status, note),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpReviewKeys.spotcheck() }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to record the spot-check'),
  });
}
