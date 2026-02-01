// hooks/okr/use-key-results.ts
// React Query hooks for OKR Key Results

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import {
  OKRKeyResult,
  CreateOKRKeyResultDTO,
  UpdateOKRKeyResultDTO,
  ABCDAnalysis,
  ABCDDistribution,
  DCategoryAlert,
  ABCDCategory
} from '@/types/okr';
import { OKRKeyResultService } from '@/lib/services/okr';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { objectiveKeys } from './use-objectives';

// Query key factory for key results
export const keyResultKeys = {
  all: ['okr-key-results'] as const,
  byObjective: (objectiveId: string) =>
    [...keyResultKeys.all, 'objective', objectiveId] as const,
  details: () => [...keyResultKeys.all, 'detail'] as const,
  detail: (id: string) => [...keyResultKeys.details(), id] as const,
  autoTracked: () => [...keyResultKeys.all, 'auto-tracked'] as const,
  // ABCD Matrix keys
  abcdAnalysis: (filters?: { institution_id?: string; department_id?: string; owner_id?: string; category?: ABCDCategory }) =>
    [...keyResultKeys.all, 'abcd-analysis', filters] as const,
  abcdDistribution: (filters?: { institution_id?: string; department_id?: string; owner_id?: string }) =>
    [...keyResultKeys.all, 'abcd-distribution', filters] as const,
  dCategoryAlerts: (institutionId?: string) =>
    [...keyResultKeys.all, 'd-category-alerts', institutionId] as const
};

/**
 * Get key results for an objective
 */
export function useKeyResultsByObjective(
  objectiveId: string
): UseQueryResult<OKRKeyResult[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: keyResultKeys.byObjective(objectiveId),
    queryFn: () => OKRKeyResultService.getKeyResultsByObjective(objectiveId),
    enabled: !authLoading && !!profile && !!objectiveId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get single key result by ID
 */
export function useKeyResult(id: string): UseQueryResult<OKRKeyResult, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: keyResultKeys.detail(id),
    queryFn: () => OKRKeyResultService.getKeyResultById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get all auto-tracked key results needing sync
 */
export function useAutoTrackedKeyResults(): UseQueryResult<OKRKeyResult[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: keyResultKeys.autoTracked(),
    queryFn: () => OKRKeyResultService.getAutoTrackedKeyResults(),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Create key result mutation
 */
export function useCreateKeyResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOKRKeyResultDTO) =>
      OKRKeyResultService.createKeyResult(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: keyResultKeys.byObjective(data.objective_id)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(data.objective_id)
      });
    }
  });
}

/**
 * Update key result mutation
 */
export function useUpdateKeyResult(id: string, objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOKRKeyResultDTO) =>
      OKRKeyResultService.updateKeyResult(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: keyResultKeys.detail(id) });
      queryClient.invalidateQueries({
        queryKey: keyResultKeys.byObjective(objectiveId)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(objectiveId)
      });
      queryClient.setQueryData(keyResultKeys.detail(id), data);
    }
  });
}

/**
 * Update key result progress mutation
 */
export function useUpdateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      newValue,
      source = 'manual',
      checkInId,
      exceptionNote
    }: {
      id: string;
      newValue: number;
      source?: 'auto' | 'manual';
      checkInId?: string;
      exceptionNote?: string;
    }) => OKRKeyResultService.updateProgress(id, newValue, source, checkInId, exceptionNote),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: keyResultKeys.detail(data.id) });
      queryClient.invalidateQueries({
        queryKey: keyResultKeys.byObjective(data.objective_id)
      });
      queryClient.invalidateQueries({ queryKey: ['okr-check-ins'] });
    }
  });
}

/**
 * Delete key result mutation
 */
export function useDeleteKeyResult(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => OKRKeyResultService.deleteKeyResult(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: keyResultKeys.byObjective(objectiveId)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(objectiveId)
      });
    }
  });
}

/**
 * Reorder key results mutation
 */
export function useReorderKeyResults(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      OKRKeyResultService.reorderKeyResults(objectiveId, orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: keyResultKeys.byObjective(objectiveId)
      });
    }
  });
}

// ============================================================================
// A/B/C/D MATRIX HOOKS
// ============================================================================

/**
 * Update process rating mutation
 */
export function useUpdateProcessRating() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      keyResultId,
      rating,
      notes
    }: {
      keyResultId: string;
      rating: number;
      notes?: string;
    }) => OKRKeyResultService.updateProcessRating(keyResultId, rating, notes),
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: keyResultKeys.detail(data.id) });
      queryClient.invalidateQueries({
        queryKey: keyResultKeys.byObjective(data.objective_id)
      });
      // Invalidate ABCD queries
      queryClient.invalidateQueries({
        queryKey: ['okr-key-results', 'abcd-analysis']
      });
      queryClient.invalidateQueries({
        queryKey: ['okr-key-results', 'abcd-distribution']
      });
      queryClient.invalidateQueries({
        queryKey: ['okr-key-results', 'd-category-alerts']
      });
    }
  });
}

/**
 * Get ABCD analysis for key results
 */
export function useABCDAnalysis(filters?: {
  institution_id?: string;
  department_id?: string;
  owner_id?: string;
  category?: ABCDCategory;
}): UseQueryResult<ABCDAnalysis[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: keyResultKeys.abcdAnalysis(filters),
    queryFn: () => OKRKeyResultService.getABCDAnalysis(filters),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get ABCD distribution for charts
 */
export function useABCDDistribution(filters?: {
  institution_id?: string;
  department_id?: string;
  owner_id?: string;
}): UseQueryResult<ABCDDistribution[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: keyResultKeys.abcdDistribution(filters),
    queryFn: () => OKRKeyResultService.getABCDDistribution(filters),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get D-category alerts (False Security items)
 */
export function useDCategoryAlerts(institutionId?: string): UseQueryResult<DCategoryAlert[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: keyResultKeys.dCategoryAlerts(institutionId),
    queryFn: () => OKRKeyResultService.getDCategoryAlerts(institutionId),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}
