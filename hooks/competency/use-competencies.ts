// ============================================================================
// React Query hooks for Competency Catalog
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import type {
  Competency,
  CompetencyListResponse,
  CompetencyFilters,
  CreateCompetencyDTO,
  UpdateCompetencyDTO,
  CompetencyStats,
  CompetencyPickerOption
} from '@/types/competency';
import { CompetencyCatalogService } from '@/lib/services/competency';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory
export const competencyKeys = {
  all: ['competencies'] as const,
  lists: () => [...competencyKeys.all, 'list'] as const,
  list: (filters: CompetencyFilters) => [...competencyKeys.lists(), filters] as const,
  details: () => [...competencyKeys.all, 'detail'] as const,
  detail: (id: string) => [...competencyKeys.details(), id] as const,
  stats: (institutionId: string) => [...competencyKeys.all, 'stats', institutionId] as const,
  options: (institutionId: string) => [...competencyKeys.all, 'options', institutionId] as const
};

/**
 * Get competencies with filters and pagination
 */
export function useCompetencies(
  filters: Partial<CompetencyFilters> = {}
): UseQueryResult<CompetencyListResponse<Competency>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters = {
      institution_id: filters.institution_id || '',
      competency_type: filters.competency_type,
      is_active: filters.is_active,
      search: filters.search,
      page: filters.page || 1,
      limit: filters.limit || 10,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order
    };
    return competencyKeys.list(stableFilters);
  }, [
    filters.institution_id,
    filters.competency_type,
    filters.is_active,
    filters.search,
    filters.page,
    filters.limit,
    filters.sort_by,
    filters.sort_order
  ]);

  const queryFn = useCallback(async () => {
    try {
      if (process.env.NODE_ENV === 'development') {
      }
      const result = await CompetencyCatalogService.getCompetencies(filters as CompetencyFilters);
      if (process.env.NODE_ENV === 'development') {
      }
      return result;
    } catch (error) {
      console.error('[useCompetencies] Fetch error:', error);
      // Preserve original error message for debugging
      const message = error instanceof Error ? error.message : 'Failed to fetch competencies';
      throw new Error(message);
    }
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile && !!filters.institution_id,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get single competency by ID
 */
export function useCompetency(id: string): UseQueryResult<Competency, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: competencyKeys.detail(id),
    queryFn: () => CompetencyCatalogService.getCompetencyById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get competency statistics for institution
 */
export function useCompetencyStats(
  institutionId: string
): UseQueryResult<CompetencyStats, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryFn = useCallback(async () => {
    try {
      return await CompetencyCatalogService.getCompetencyStats(institutionId);
    } catch (error) {
      console.error('[useCompetencyStats] Error fetching stats:', error);
      // Return empty stats instead of throwing to prevent page crash
      return {
        total_competencies: 0,
        by_type: {
          technical: 0,
          behavioral: 0,
          domain: 0,
          soft_skill: 0
        },
        avg_finks_dimensions: {
          foundational_knowledge: 0,
          application: 0,
          integration: 0,
          human_dimension: 0,
          caring: 0,
          learning_to_learn: 0
        },
        by_dominant_finks_dimension: {
          foundational_knowledge: 0,
          application: 0,
          integration: 0,
          human_dimension: 0,
          caring: 0,
          learning_to_learn: 0
        },
        mapped_to_programs: 0,
        mapped_to_courses: 0,
        active_count: 0,
        inactive_count: 0
      };
    }
  }, [institutionId]);

  return useQuery({
    queryKey: competencyKeys.stats(institutionId),
    queryFn,
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get competency options for picker (simplified list)
 */
export function useCompetencyOptions(
  institutionId: string
): UseQueryResult<CompetencyPickerOption[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: competencyKeys.options(institutionId),
    queryFn: () => CompetencyCatalogService.getCompetencyOptions(institutionId),
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.FORM_DATA
  });
}

/**
 * Create competency mutation
 */
export function useCreateCompetency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCompetencyDTO) =>
      CompetencyCatalogService.createCompetency(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: competencyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: competencyKeys.stats(data.institution_id) });
      queryClient.invalidateQueries({ queryKey: competencyKeys.options(data.institution_id) });
    }
  });
}

/**
 * Update competency mutation
 */
export function useUpdateCompetency(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateCompetencyDTO) =>
      CompetencyCatalogService.updateCompetency(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: competencyKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: competencyKeys.lists() });
      queryClient.setQueryData(competencyKeys.detail(id), data);
    }
  });
}

/**
 * Archive competency mutation
 */
export function useArchiveCompetency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => CompetencyCatalogService.archiveCompetency(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: competencyKeys.lists() });
    }
  });
}

/**
 * Restore archived competency mutation
 */
export function useRestoreCompetency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => CompetencyCatalogService.restoreCompetency(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: competencyKeys.lists() });
    }
  });
}
