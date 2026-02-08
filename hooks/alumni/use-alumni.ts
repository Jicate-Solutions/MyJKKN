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
      batch_id: filters.batch_id,
      verification_status: filters.verification_status,
      is_relevant_to_program: filters.is_relevant_to_program,
      city: filters.city,
      state: filters.state,
      country: filters.country,
      salary_range: filters.salary_range,
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
    filters.batch_id,
    filters.verification_status,
    filters.is_relevant_to_program,
    filters.city,
    filters.state,
    filters.country,
    filters.salary_range,
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
    return await AlumniOutcomeService.getDashboardStats(institutionId);
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
      cohort_year: filters.cohort_year,
      cohort_batch_id: filters.cohort_batch_id,
      is_published: filters.is_published,
      page: filters.page || 1,
      limit: filters.limit || 20
    };
    return alumniKeys.correlationList(stableFilters);
  }, [
    filters.institution_id,
    filters.program_id,
    filters.cohort_year,
    filters.cohort_batch_id,
    filters.is_published,
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
    mutationFn: ({ institutionId, programId, cohortYear }: {
      institutionId: string;
      programId: string;
      cohortYear: number;
    }) => OutcomeCorrelationService.computeCorrelation(institutionId, programId, cohortYear),
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
