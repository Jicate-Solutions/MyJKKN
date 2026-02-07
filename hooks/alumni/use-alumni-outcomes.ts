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
  CreateOutcomeCorrelationInput,
  UpdateOutcomeCorrelationInput
} from '@/types/alumni';
import { AlumniOutcomeService, OutcomeCorrelationService } from '@/lib/services/alumni';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================================================
// QUERY KEY FACTORIES
// ============================================================================

export const alumniOutcomeKeys = {
  all: ['alumni-outcomes'] as const,
  lists: () => [...alumniOutcomeKeys.all, 'list'] as const,
  list: (filters: AlumniOutcomeFilters) => [...alumniOutcomeKeys.lists(), filters] as const,
  details: () => [...alumniOutcomeKeys.all, 'detail'] as const,
  detail: (id: string) => [...alumniOutcomeKeys.details(), id] as const,
  stats: (institutionId: string) => [...alumniOutcomeKeys.all, 'stats', institutionId] as const
};

export const correlationKeys = {
  all: ['outcome-correlations'] as const,
  lists: () => [...correlationKeys.all, 'list'] as const,
  list: (filters: OutcomeCorrelationFilters) => [...correlationKeys.lists(), filters] as const,
  details: () => [...correlationKeys.all, 'detail'] as const,
  detail: (id: string) => [...correlationKeys.details(), id] as const
};

// ============================================================================
// ALUMNI OUTCOME HOOKS
// ============================================================================

/**
 * Fetch alumni outcomes with filters and pagination
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
    return alumniOutcomeKeys.list(stableFilters);
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
    const result = await AlumniOutcomeService.getOutcomes(filters as AlumniOutcomeFilters);
    return result;
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!filters.institution_id,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Fetch single alumni outcome by ID
 */
export function useAlumniOutcome(id: string | undefined): UseQueryResult<AlumniOutcome, Error> {
  return useQuery({
    queryKey: alumniOutcomeKeys.detail(id || ''),
    queryFn: () => AlumniOutcomeService.getOutcomeById(id!),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Fetch dashboard stats for an institution
 */
export function useAlumniDashboardStats(
  institutionId: string | undefined
): UseQueryResult<AlumniDashboardStats, Error> {
  return useQuery({
    queryKey: alumniOutcomeKeys.stats(institutionId || ''),
    queryFn: () => AlumniOutcomeService.getDashboardStats(institutionId!),
    enabled: !!institutionId,
    ...QUERY_CONFIG.DASHBOARD_DATA
  });
}

/**
 * Create alumni outcome mutation
 */
export function useCreateAlumniOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAlumniOutcomeInput) => AlumniOutcomeService.createOutcome(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alumniOutcomeKeys.all });
    }
  });
}

/**
 * Update alumni outcome mutation
 */
export function useUpdateAlumniOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UpdateAlumniOutcomeInput> }) =>
      AlumniOutcomeService.updateOutcome(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: alumniOutcomeKeys.all });
      queryClient.invalidateQueries({ queryKey: alumniOutcomeKeys.detail(variables.id) });
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
      queryClient.invalidateQueries({ queryKey: alumniOutcomeKeys.all });
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: alumniOutcomeKeys.all });
      queryClient.invalidateQueries({ queryKey: alumniOutcomeKeys.detail(variables.id) });
    }
  });
}

// ============================================================================
// OUTCOME CORRELATION HOOKS
// ============================================================================

/**
 * Fetch outcome correlations with filters
 */
export function useOutcomeCorrelations(
  filters: Partial<OutcomeCorrelationFilters> = {}
): UseQueryResult<AlumniListResponse<OutcomeProgramCorrelation>, Error> {
  const { isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters: OutcomeCorrelationFilters = {
      institution_id: filters.institution_id || '',
      program_id: filters.program_id,
      department_id: filters.department_id,
      academic_year: filters.academic_year,
      page: filters.page || 1,
      limit: filters.limit || 20
    };
    return correlationKeys.list(stableFilters);
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
    enabled: !authLoading && !!filters.institution_id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Fetch single correlation by ID
 */
export function useOutcomeCorrelation(id: string | undefined): UseQueryResult<OutcomeProgramCorrelation, Error> {
  return useQuery({
    queryKey: correlationKeys.detail(id || ''),
    queryFn: () => OutcomeCorrelationService.getCorrelationById(id!),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Compute correlation mutation
 */
export function useComputeCorrelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      institutionId,
      programId,
      academicYear
    }: {
      institutionId: string;
      programId: string;
      academicYear: string;
    }) => OutcomeCorrelationService.computeCorrelation(institutionId, programId, academicYear),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: correlationKeys.all });
    }
  });
}

/**
 * Upsert correlation mutation
 */
export function useUpsertCorrelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOutcomeCorrelationInput) =>
      OutcomeCorrelationService.upsertCorrelation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: correlationKeys.all });
    }
  });
}

/**
 * Delete correlation mutation
 */
export function useDeleteCorrelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => OutcomeCorrelationService.deleteCorrelation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: correlationKeys.all });
    }
  });
}
