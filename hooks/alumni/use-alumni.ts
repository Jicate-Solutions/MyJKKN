// ============================================================================
// React Query hooks for Alumni Outcomes Module
// Phase P4.1 - Accountability
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import type {
  AlumniOutcome,
  AlumniListResponse,
  AlumniOutcomeFilters,
  CreateAlumniOutcomeInput,
  UpdateAlumniOutcomeInput,
  AlumniDashboardStats,
  OutcomeProgramCorrelation,
  OutcomeCorrelationFilters,
  CreateOutcomeCorrelationInput
} from '@/types/alumni';
import { AlumniOutcomeService, OutcomeCorrelationService } from '@/lib/services/alumni';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================================================
// QUERY KEY FACTORY
// ============================================================================

export const alumniKeys = {
  all: ['alumni'] as const,
  // Outcomes
  outcomes: () => [...alumniKeys.all, 'outcomes'] as const,
  outcomeList: (filters: AlumniOutcomeFilters) => [...alumniKeys.outcomes(), 'list', filters] as const,
  outcomeDetail: (id: string) => [...alumniKeys.outcomes(), 'detail', id] as const,
  // Stats
  dashboardStats: (institutionId: string) => [...alumniKeys.all, 'dashboard-stats', institutionId] as const,
  // Correlations
  correlations: () => [...alumniKeys.all, 'correlations'] as const,
  correlationList: (filters: OutcomeCorrelationFilters) => [...alumniKeys.correlations(), 'list', filters] as const,
  correlationDetail: (id: string) => [...alumniKeys.correlations(), 'detail', id] as const
};

// ============================================================================
// ALUMNI OUTCOME HOOKS
// ============================================================================

/**
 * Get alumni outcomes with filters and pagination
 */
export function useAlumniOutcomes(
  filters: Partial<AlumniOutcomeFilters> = {}
): UseQueryResult<AlumniListResponse<AlumniOutcome>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters: AlumniOutcomeFilters = {
      institution_id: filters.institution_id || '',
      search: filters.search,
      outcome_type: filters.outcome_type,
      graduation_year: filters.graduation_year,
      program_id: filters.program_id,
      department_id: filters.department_id,
      verified: filters.verified,
      data_source: filters.data_source,
      is_core_domain: filters.is_core_domain,
      page: filters.page || 1,
      limit: filters.limit || 10,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order
    };
    return alumniKeys.outcomeList(stableFilters);
  }, [
    filters.institution_id,
    filters.search,
    filters.outcome_type,
    filters.graduation_year,
    filters.program_id,
    filters.department_id,
    filters.verified,
    filters.data_source,
    filters.is_core_domain,
    filters.page,
    filters.limit,
    filters.sort_by,
    filters.sort_order
  ]);

  const queryFn = useCallback(async () => {
    return AlumniOutcomeService.getOutcomes(filters as AlumniOutcomeFilters);
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile && !!filters.institution_id,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get single alumni outcome by ID
 */
export function useAlumniOutcome(id: string): UseQueryResult<AlumniOutcome, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: alumniKeys.outcomeDetail(id),
    queryFn: () => AlumniOutcomeService.getOutcomeById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get alumni dashboard statistics
 */
export function useAlumniDashboardStats(
  institutionId: string
): UseQueryResult<AlumniDashboardStats, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryFn = useCallback(async () => {
    try {
      return await AlumniOutcomeService.getDashboardStats(institutionId);
    } catch (error) {
      console.error('[useAlumniDashboardStats] Error:', error);
      return {
        total_tracked: 0,
        by_outcome_type: {
          employed: 0,
          higher_studies: 0,
          entrepreneur: 0,
          freelancer: 0,
          unemployed: 0,
          unknown: 0
        },
        placement_percentage: 0,
        higher_studies_percentage: 0,
        entrepreneur_percentage: 0,
        core_domain_percentage: 0,
        average_satisfaction: 0,
        verified_count: 0,
        unverified_count: 0,
        average_time_to_placement_days: 0,
        by_salary_range: {}
      };
    }
  }, [institutionId]);

  return useQuery({
    queryKey: alumniKeys.dashboardStats(institutionId),
    queryFn,
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.DASHBOARD_DATA
  });
}

/**
 * Create alumni outcome mutation
 */
export function useCreateAlumniOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAlumniOutcomeInput) =>
      AlumniOutcomeService.createOutcome(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: alumniKeys.outcomes() });
      queryClient.invalidateQueries({ queryKey: alumniKeys.dashboardStats(data.institution_id) });
    }
  });
}

/**
 * Update alumni outcome mutation
 */
export function useUpdateAlumniOutcome(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<UpdateAlumniOutcomeInput>) =>
      AlumniOutcomeService.updateOutcome(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: alumniKeys.outcomeDetail(id) });
      queryClient.invalidateQueries({ queryKey: alumniKeys.outcomes() });
      queryClient.setQueryData(alumniKeys.outcomeDetail(id), data);
    }
  });
}

/**
 * Delete alumni outcome mutation
 */
export function useDeleteAlumniOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => AlumniOutcomeService.deleteOutcome(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alumniKeys.outcomes() });
    }
  });
}

/**
 * Verify alumni outcome mutation
 */
export function useVerifyAlumniOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, verifiedBy }: { id: string; verifiedBy: string }) =>
      AlumniOutcomeService.verifyOutcome(id, verifiedBy),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: alumniKeys.outcomeDetail(data.id) });
      queryClient.invalidateQueries({ queryKey: alumniKeys.outcomes() });
    }
  });
}

// ============================================================================
// OUTCOME CORRELATION HOOKS
// ============================================================================

/**
 * Get outcome correlations (program effectiveness data)
 */
export function useOutcomeCorrelations(
  filters: Partial<OutcomeCorrelationFilters> = {}
): UseQueryResult<AlumniListResponse<OutcomeProgramCorrelation>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters: OutcomeCorrelationFilters = {
      institution_id: filters.institution_id || '',
      program_id: filters.program_id,
      department_id: filters.department_id,
      academic_year: filters.academic_year,
      page: filters.page || 1,
      limit: filters.limit || 20
    };
    return alumniKeys.correlationList(stableFilters);
  }, [
    filters.institution_id,
    filters.program_id,
    filters.department_id,
    filters.academic_year,
    filters.page,
    filters.limit
  ]);

  return useQuery({
    queryKey,
    queryFn: () => OutcomeCorrelationService.getCorrelations(filters as OutcomeCorrelationFilters),
    enabled: !authLoading && !!profile && !!filters.institution_id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get single correlation by ID
 */
export function useOutcomeCorrelation(id: string): UseQueryResult<OutcomeProgramCorrelation, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: alumniKeys.correlationDetail(id),
    queryFn: () => OutcomeCorrelationService.getCorrelationById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Compute correlation mutation
 */
export function useComputeCorrelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ institutionId, programId, academicYear }: {
      institutionId: string;
      programId: string;
      academicYear: string;
    }) => OutcomeCorrelationService.computeCorrelation(institutionId, programId, academicYear),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alumniKeys.correlations() });
    }
  });
}

/**
 * Upsert correlation mutation
 */
export function useUpsertCorrelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOutcomeCorrelationInput) =>
      OutcomeCorrelationService.upsertCorrelation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alumniKeys.correlations() });
    }
  });
}
