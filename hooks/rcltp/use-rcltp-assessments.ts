/**
 * EKSAQ RCLTP — Assessments domain hooks (Phase B)
 * ----------------------------------------------------------------------------
 * React Query layer for rcltp_assessments, rcltp_part_a_recordings, and
 * rcltp_part_b_responses (see use-rcltp-passages.ts for the canonical pattern):
 *   - a `*Keys` factory per entity for stable, filter-aware query keys
 *   - reads: useQuery + a QUERY_CONFIG preset + placeholderData for smooth paging
 *   - staff/admin mutations: call the service method directly (MyJKKN convention)
 *     and invalidate the relevant key tree on success
 *   - student-affecting mutations are intentionally absent — they post to
 *     server-side routes (Phase C); the service stubs throw if called client-side.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { RcltpAssessmentsService } from '@/lib/services/rcltp/assessments-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type {
  RcltpAssessmentFilters,
  RcltpPartARecordingFilters,
  RcltpPartBResponseFilters,
  CreateRcltpAssessmentDto,
  UpdateRcltpAssessmentDto,
  UpdateRcltpRecordingReviewDto,
} from '@/types/rcltp';

export const rcltpAssessmentKeys = {
  all: ['rcltp', 'assessments'] as const,
  lists: () => [...rcltpAssessmentKeys.all, 'list'] as const,
  list: (filters: RcltpAssessmentFilters) =>
    [...rcltpAssessmentKeys.lists(), filters] as const,
  detail: (id: string) => [...rcltpAssessmentKeys.all, 'detail', id] as const,
};

export const rcltpRecordingKeys = {
  all: ['rcltp', 'recordings'] as const,
  lists: () => [...rcltpRecordingKeys.all, 'list'] as const,
  list: (filters: RcltpPartARecordingFilters) =>
    [...rcltpRecordingKeys.lists(), filters] as const,
  detail: (id: string) => [...rcltpRecordingKeys.all, 'detail', id] as const,
};

export const rcltpResponseKeys = {
  all: ['rcltp', 'responses'] as const,
  list: (filters: RcltpPartBResponseFilters) =>
    [...rcltpResponseKeys.all, 'list', filters] as const,
};

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

export function useRcltpAssessments(filters: RcltpAssessmentFilters = {}) {
  return useQuery({
    queryKey: rcltpAssessmentKeys.list(filters),
    queryFn: () => RcltpAssessmentsService.getAssessments(filters),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useRcltpAssessment(id: string) {
  return useQuery({
    queryKey: rcltpAssessmentKeys.detail(id),
    queryFn: () => RcltpAssessmentsService.getAssessmentById(id),
    enabled: !!id,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useRcltpRecordings(filters: RcltpPartARecordingFilters = {}) {
  return useQuery({
    queryKey: rcltpRecordingKeys.list(filters),
    queryFn: () => RcltpAssessmentsService.getRecordings(filters),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useRcltpRecording(id: string) {
  return useQuery({
    queryKey: rcltpRecordingKeys.detail(id),
    queryFn: () => RcltpAssessmentsService.getRecordingById(id),
    enabled: !!id,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useRcltpResponses(filters: RcltpPartBResponseFilters = {}) {
  return useQuery({
    queryKey: rcltpResponseKeys.list(filters),
    queryFn: () => RcltpAssessmentsService.getResponses(filters),
    // Only fetch when scoped to a specific sitting.
    enabled: !!filters.assessment_id,
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ---------------------------------------------------------------------------
// STAFF / ADMIN MUTATIONS (direct service calls — RLS permits these writes)
// ---------------------------------------------------------------------------

export function useCreateRcltpAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRcltpAssessmentDto) =>
      RcltpAssessmentsService.createAssessment(input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpAssessmentKeys.all }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to create assessment'),
  });
}

export function useUpdateRcltpAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateRcltpAssessmentDto;
    }) => RcltpAssessmentsService.updateAssessment(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpAssessmentKeys.all }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to update assessment'),
  });
}

export function useDeleteRcltpAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      RcltpAssessmentsService.deleteAssessment(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpAssessmentKeys.all }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to delete assessment'),
  });
}

export function useReviewRcltpRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateRcltpRecordingReviewDto;
    }) => RcltpAssessmentsService.reviewRecording(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpRecordingKeys.all }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to save recording review'),
  });
}
