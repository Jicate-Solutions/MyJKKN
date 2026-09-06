/**
 * EKSAQ RCLTP — Results domain hooks (Phase B)
 * ----------------------------------------------------------------------------
 * React Query layer for results / student journey / band config:
 *   - a `*Keys` factory per entity for stable, filter-aware query keys
 *   - reads: useQuery + a QUERY_CONFIG preset + placeholderData for smooth paging
 *   - staff/admin band-config mutations: call the service method directly
 *     (MyJKKN convention) and invalidate the relevant key tree on success
 *   - the EKSAQ-deferred service stubs (computeAndStoreResult, updateStudentJourney)
 *     get NO hooks — they become server-side routes in Phase C.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { RcltpResultsService } from '@/lib/services/rcltp/results-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type {
  RcltpResultFilters,
  RcltpStudentJourneyFilters,
  RcltpBandConfigFilters,
  CreateRcltpBandConfigDto,
  UpdateRcltpBandConfigDto,
} from '@/types/rcltp';

export const rcltpResultKeys = {
  all: ['rcltp', 'results'] as const,
  lists: () => [...rcltpResultKeys.all, 'list'] as const,
  list: (filters: RcltpResultFilters) =>
    [...rcltpResultKeys.lists(), filters] as const,
  byAssessment: (assessmentId: string) =>
    [...rcltpResultKeys.all, 'assessment', assessmentId] as const,
};

export const rcltpJourneyKeys = {
  all: ['rcltp', 'journey'] as const,
  list: (filters: RcltpStudentJourneyFilters) =>
    [...rcltpJourneyKeys.all, 'list', filters] as const,
};

export const rcltpBandConfigKeys = {
  all: ['rcltp', 'band-config'] as const,
  list: (filters: RcltpBandConfigFilters) =>
    [...rcltpBandConfigKeys.all, 'list', filters] as const,
};

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

export function useRcltpResults(filters: RcltpResultFilters = {}) {
  return useQuery({
    queryKey: rcltpResultKeys.list(filters),
    queryFn: () => RcltpResultsService.getResults(filters),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useRcltpResultByAssessment(assessmentId: string) {
  return useQuery({
    queryKey: rcltpResultKeys.byAssessment(assessmentId),
    queryFn: () => RcltpResultsService.getResultByAssessment(assessmentId),
    enabled: !!assessmentId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useRcltpJourney(filters: RcltpStudentJourneyFilters = {}) {
  return useQuery({
    queryKey: rcltpJourneyKeys.list(filters),
    queryFn: () => RcltpResultsService.getJourney(filters),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useRcltpBandConfigs(filters: RcltpBandConfigFilters = {}) {
  return useQuery({
    queryKey: rcltpBandConfigKeys.list(filters),
    queryFn: () => RcltpResultsService.getBandConfigs(filters),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ---------------------------------------------------------------------------
// STAFF / ADMIN MUTATIONS (direct service calls — RLS permits these writes)
// ---------------------------------------------------------------------------

export function useCreateRcltpBandConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRcltpBandConfigDto) =>
      RcltpResultsService.createBandConfig(input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpBandConfigKeys.all }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to create band config'),
  });
}

export function useUpdateRcltpBandConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRcltpBandConfigDto }) =>
      RcltpResultsService.updateBandConfig(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpBandConfigKeys.all }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to update band config'),
  });
}

export function useDeleteRcltpBandConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => RcltpResultsService.deleteBandConfig(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: rcltpBandConfigKeys.all }),
    onError: (e: any) =>
      toast.error(e?.message || 'Failed to delete band config'),
  });
}
