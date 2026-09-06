/**
 * EKSAQ RCLTP — Schedule domain hooks (Phase B)
 * ----------------------------------------------------------------------------
 * React Query layer for the schedule domain (see use-rcltp-passages.ts pattern):
 *   - a `*Keys` factory for stable, filter-aware query keys
 *   - reads: useQuery + a QUERY_CONFIG preset + placeholderData for smooth paging
 *   - staff mutations: call the service method directly (MyJKKN convention) and
 *     invalidate the relevant key tree on success
 *   - student-affecting mutations are intentionally absent here — practice
 *     completion posts to a server-side route (Phase C); the service stub throws
 *     if called client-side. The EKSAQ-deferred assignment stub also gets no hook.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { RcltpScheduleService } from '@/lib/services/rcltp/schedule-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type {
  RcltpScheduleFilters,
  RcltpPracticeAssignmentFilters,
  CreateRcltpScheduleDto,
  UpdateRcltpScheduleDto,
} from '@/types/rcltp';

export const rcltpScheduleKeys = {
  all: ['rcltp', 'schedule'] as const,
  lists: () => [...rcltpScheduleKeys.all, 'list'] as const,
  list: (filters: RcltpScheduleFilters) =>
    [...rcltpScheduleKeys.lists(), filters] as const,
  detail: (id: string) => [...rcltpScheduleKeys.all, 'detail', id] as const,
};

export const rcltpPracticeKeys = {
  all: ['rcltp', 'practice'] as const,
  list: (filters: RcltpPracticeAssignmentFilters) =>
    [...rcltpPracticeKeys.all, 'list', filters] as const,
};

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

export function useRcltpSchedule(filters: RcltpScheduleFilters = {}) {
  return useQuery({
    queryKey: rcltpScheduleKeys.list(filters),
    queryFn: () => RcltpScheduleService.getSchedule(filters),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useRcltpScheduleWindow(id: string) {
  return useQuery({
    queryKey: rcltpScheduleKeys.detail(id),
    queryFn: () => RcltpScheduleService.getScheduleById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useRcltpPracticeAssignments(
  filters: RcltpPracticeAssignmentFilters = {}
) {
  return useQuery({
    queryKey: rcltpPracticeKeys.list(filters),
    queryFn: () => RcltpScheduleService.getPracticeAssignments(filters),
    // Learner-scoped surface — don't fire an unscoped fetch before the learner
    // id resolves (avoids an over-broad query racing the learner-id lookup).
    enabled: !!filters.learner_id,
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ---------------------------------------------------------------------------
// STAFF MUTATIONS (direct service calls — RLS §6.13 permits these writes)
// ---------------------------------------------------------------------------

export function useCreateRcltpScheduleWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRcltpScheduleDto) =>
      RcltpScheduleService.createScheduleWindow(input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpScheduleKeys.all }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to create schedule window'),
  });
}

export function useUpdateRcltpScheduleWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRcltpScheduleDto }) =>
      RcltpScheduleService.updateScheduleWindow(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpScheduleKeys.all }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to update schedule window'),
  });
}

export function useConfirmRcltpScheduleWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmedBy }: { id: string; confirmedBy: string }) =>
      RcltpScheduleService.confirmScheduleWindow(id, confirmedBy),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpScheduleKeys.all }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to confirm schedule window'),
  });
}

export function useDeleteRcltpScheduleWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => RcltpScheduleService.deleteScheduleWindow(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpScheduleKeys.all }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to delete schedule window'),
  });
}
