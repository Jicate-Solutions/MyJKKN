/**
 * EKSAQ RCLTP — VBB (vocabulary) domain hooks (Phase B)
 * ----------------------------------------------------------------------------
 * React Query layer for the VBB domain, following the canonical rcltp pattern:
 *   - a `*Keys` factory for stable, filter-aware query keys
 *   - reads: useQuery + a QUERY_CONFIG preset + placeholderData for smooth paging
 *   - staff/admin mutations: call the service method directly (MyJKKN convention)
 *     and invalidate the relevant key tree on success
 *   - student-affecting mutations are intentionally absent here — they post to
 *     server-side routes (Phase C); the service stubs throw if called client-side.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { RcltpVbbService } from '@/lib/services/rcltp/vbb-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type {
  RcltpVbbWordFilters,
  RcltpVbbProgressFilters,
  CreateRcltpVbbWordDto,
  UpdateRcltpVbbWordDto,
} from '@/types/rcltp';

export const rcltpVbbWordKeys = {
  all: ['rcltp', 'vbb-words'] as const,
  lists: () => [...rcltpVbbWordKeys.all, 'list'] as const,
  list: (filters: RcltpVbbWordFilters) =>
    [...rcltpVbbWordKeys.lists(), filters] as const,
  detail: (id: string) => [...rcltpVbbWordKeys.all, 'detail', id] as const,
};

export const rcltpVbbProgressKeys = {
  all: ['rcltp', 'vbb-progress'] as const,
  list: (filters: RcltpVbbProgressFilters) =>
    [...rcltpVbbProgressKeys.all, 'list', filters] as const,
};

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

export function useRcltpVbbWords(filters: RcltpVbbWordFilters = {}) {
  return useQuery({
    queryKey: rcltpVbbWordKeys.list(filters),
    queryFn: () => RcltpVbbService.getWords(filters),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useRcltpVbbWord(id: string) {
  return useQuery({
    queryKey: rcltpVbbWordKeys.detail(id),
    queryFn: () => RcltpVbbService.getWordById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useRcltpVbbProgress(filters: RcltpVbbProgressFilters = {}) {
  return useQuery({
    queryKey: rcltpVbbProgressKeys.list(filters),
    queryFn: () => RcltpVbbService.getProgress(filters),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ---------------------------------------------------------------------------
// STAFF / ADMIN MUTATIONS (direct service calls — RLS permits these writes)
// ---------------------------------------------------------------------------

export function useCreateRcltpVbbWord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRcltpVbbWordDto) =>
      RcltpVbbService.createWord(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: rcltpVbbWordKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to create word'),
  });
}

export function useUpdateRcltpVbbWord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRcltpVbbWordDto }) =>
      RcltpVbbService.updateWord(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: rcltpVbbWordKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to update word'),
  });
}

export function useDeleteRcltpVbbWord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => RcltpVbbService.deleteWord(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: rcltpVbbWordKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to delete word'),
  });
}
