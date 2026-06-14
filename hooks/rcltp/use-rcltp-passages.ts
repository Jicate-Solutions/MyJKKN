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
