// ============================================================================
// React Query hooks for Facilitator Development Module
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import type {
  FacilitatorDevelopment,
  FacilitatorIndustryImmersion,
  FacilitatorListResponse,
  FacilitatorDevelopmentFilters,
  ImmersionFilters,
  CreateFacilitatorDevelopmentInput,
  UpdateFacilitatorDevelopmentInput,
  CreateImmersionInput,
  UpdateImmersionInput,
  FacilitatorDevelopmentStats
} from '@/types/facilitator-development';
import { FacilitatorDevelopmentService, FacilitatorImmersionService } from '@/lib/services/facilitator';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================================================
// Query key factory
// ============================================================================

export const facilitatorDevKeys = {
  all: ['facilitator-development'] as const,
  lists: () => [...facilitatorDevKeys.all, 'list'] as const,
  list: (filters: FacilitatorDevelopmentFilters) => [...facilitatorDevKeys.lists(), filters] as const,
  details: () => [...facilitatorDevKeys.all, 'detail'] as const,
  detail: (id: string) => [...facilitatorDevKeys.details(), id] as const,
  stats: (institutionId: string) => [...facilitatorDevKeys.all, 'stats', institutionId] as const,
  // Immersion keys
  immersions: () => [...facilitatorDevKeys.all, 'immersion'] as const,
  immersionList: (filters: ImmersionFilters) => [...facilitatorDevKeys.immersions(), 'list', filters] as const,
  immersionsByDev: (devId: string) => [...facilitatorDevKeys.immersions(), 'by-dev', devId] as const,
  immersionDetail: (id: string) => [...facilitatorDevKeys.immersions(), 'detail', id] as const
};

// ============================================================================
// Development Record Hooks
// ============================================================================

/**
 * Get development records with filters and pagination
 */
export function useFacilitatorDevelopments(
  filters: Partial<FacilitatorDevelopmentFilters> = {}
): UseQueryResult<FacilitatorListResponse<FacilitatorDevelopment>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters = {
      institution_id: filters.institution_id || '',
      staff_id: filters.staff_id,
      current_stage: filters.current_stage,
      status: filters.status,
      mentor_id: filters.mentor_id,
      search: filters.search,
      page: filters.page || 1,
      limit: filters.limit || 10,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order
    };
    return facilitatorDevKeys.list(stableFilters);
  }, [
    filters.institution_id,
    filters.staff_id,
    filters.current_stage,
    filters.status,
    filters.mentor_id,
    filters.search,
    filters.page,
    filters.limit,
    filters.sort_by,
    filters.sort_order
  ]);

  const queryFn = useCallback(async () => {
    return await FacilitatorDevelopmentService.getDevelopmentRecords(
      filters as FacilitatorDevelopmentFilters
    );
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile && !!filters.institution_id,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get single development record by ID with immersions
 */
export function useFacilitatorDevelopment(
  id: string
): UseQueryResult<FacilitatorDevelopment, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: facilitatorDevKeys.detail(id),
    queryFn: () => FacilitatorDevelopmentService.getDevelopmentById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get development statistics for institution
 */
export function useFacilitatorDevelopmentStats(
  institutionId: string
): UseQueryResult<FacilitatorDevelopmentStats, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryFn = useCallback(async () => {
    return await FacilitatorDevelopmentService.getDevelopmentStats(institutionId);
  }, [institutionId]);

  return useQuery({
    queryKey: facilitatorDevKeys.stats(institutionId),
    queryFn,
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Create development record mutation
 */
export function useCreateFacilitatorDevelopment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFacilitatorDevelopmentInput) =>
      FacilitatorDevelopmentService.createDevelopment(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.lists() });
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.stats(data.institution_id) });
    }
  });
}

/**
 * Update development record mutation
 */
export function useUpdateFacilitatorDevelopment(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateFacilitatorDevelopmentInput) =>
      FacilitatorDevelopmentService.updateDevelopment(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.lists() });
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.all }); // Invalidate stats
      queryClient.setQueryData(facilitatorDevKeys.detail(id), data);
    }
  });
}

/**
 * Delete development record mutation
 */
export function useDeleteFacilitatorDevelopment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => FacilitatorDevelopmentService.deleteDevelopment(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.lists() });
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.all }); // Invalidate stats
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.immersions() }); // Cascade delete cleanup
    }
  });
}

// ============================================================================
// Immersion Hooks
// ============================================================================

/**
 * Get immersions with filters (paginated)
 */
export function useImmersions(
  filters: Partial<ImmersionFilters> = {}
): UseQueryResult<FacilitatorListResponse<FacilitatorIndustryImmersion>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters = {
      development_id: filters.development_id,
      status: filters.status,
      industry: filters.industry,
      search: filters.search,
      page: filters.page || 1,
      limit: filters.limit || 10,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order
    };
    return facilitatorDevKeys.immersionList(stableFilters);
  }, [
    filters.development_id,
    filters.status,
    filters.industry,
    filters.search,
    filters.page,
    filters.limit,
    filters.sort_by,
    filters.sort_order
  ]);

  return useQuery({
    queryKey,
    queryFn: () => FacilitatorImmersionService.getImmersions(filters as ImmersionFilters),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get immersions for a specific development record (no pagination)
 */
export function useImmersionsByDevelopment(
  developmentId: string
): UseQueryResult<FacilitatorIndustryImmersion[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: facilitatorDevKeys.immersionsByDev(developmentId),
    queryFn: () => FacilitatorImmersionService.getImmersionsByDevelopmentId(developmentId),
    enabled: !authLoading && !!profile && !!developmentId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Create immersion mutation
 */
export function useCreateImmersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateImmersionInput) =>
      FacilitatorImmersionService.createImmersion(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.immersions() });
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.detail(data.development_id) });
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.all }); // Invalidate stats (total_immersions count)
    }
  });
}

/**
 * Update immersion mutation
 */
export function useUpdateImmersion(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateImmersionInput) =>
      FacilitatorImmersionService.updateImmersion(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.immersionDetail(id) });
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.immersions() });
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.detail(data.development_id) });
    }
  });
}

/**
 * Delete immersion mutation
 */
export function useDeleteImmersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => FacilitatorImmersionService.deleteImmersion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.immersions() });
      queryClient.invalidateQueries({ queryKey: facilitatorDevKeys.all }); // Invalidate stats (total_immersions count)
    }
  });
}
