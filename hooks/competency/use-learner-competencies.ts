// ============================================================================
// React Query hooks for Learner Competencies
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import type {
  LearnerCompetency,
  CompetencyListResponse,
  LearnerCompetencyFilters,
  UpsertLearnerCompetencyDTO,
  AddCompetencyEvidenceDTO,
  RecordCompetencyAssessmentDTO,
  VerifyLearnerCompetencyDTO,
  LearnerCompetencyProgress,
  LearnerCompetencyDashboard,
  CompetencyGapAnalysis
} from '@/types/competency';
import { LearnerCompetencyService } from '@/lib/services/competency';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory
export const learnerCompetencyKeys = {
  all: ['learner-competencies'] as const,
  lists: () => [...learnerCompetencyKeys.all, 'list'] as const,
  list: (filters: LearnerCompetencyFilters) =>
    [...learnerCompetencyKeys.lists(), filters] as const,
  detail: (id: string) => [...learnerCompetencyKeys.all, 'detail', id] as const,
  progress: (learnerId: string) =>
    [...learnerCompetencyKeys.all, 'progress', learnerId] as const,
  dashboard: (learnerId: string) =>
    [...learnerCompetencyKeys.all, 'dashboard', learnerId] as const,
  gapAnalysis: (learnerId: string, programId: string) =>
    [...learnerCompetencyKeys.all, 'gap', learnerId, programId] as const
};

/**
 * Get learner competencies with filters
 */
export function useLearnerCompetencies(
  filters: LearnerCompetencyFilters = {}
): UseQueryResult<CompetencyListResponse<LearnerCompetency>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learnerCompetencyKeys.list(filters),
    queryFn: () => LearnerCompetencyService.getLearnerCompetencies(filters),
    enabled: !authLoading && !!profile && !!filters.learner_id,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get single learner competency record
 */
export function useLearnerCompetency(
  id: string
): UseQueryResult<LearnerCompetency, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learnerCompetencyKeys.detail(id),
    queryFn: () => LearnerCompetencyService.getLearnerCompetencyById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get learner competency progress summary
 */
export function useLearnerCompetencyProgress(
  learnerId: string
): UseQueryResult<LearnerCompetencyProgress, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learnerCompetencyKeys.progress(learnerId),
    queryFn: () => LearnerCompetencyService.getLearnerProgress(learnerId),
    enabled: !authLoading && !!profile && !!learnerId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get learner competency dashboard
 */
export function useLearnerCompetencyDashboard(
  learnerId: string
): UseQueryResult<LearnerCompetencyDashboard, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learnerCompetencyKeys.dashboard(learnerId),
    queryFn: () => LearnerCompetencyService.getLearnerDashboard(learnerId),
    enabled: !authLoading && !!profile && !!learnerId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get competency gap analysis for learner
 */
export function useCompetencyGapAnalysis(
  learnerId: string,
  programId: string
): UseQueryResult<CompetencyGapAnalysis, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learnerCompetencyKeys.gapAnalysis(learnerId, programId),
    queryFn: () => LearnerCompetencyService.getGapAnalysis(learnerId, programId),
    enabled: !authLoading && !!profile && !!learnerId && !!programId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Upsert learner competency mutation
 */
export function useUpsertLearnerCompetency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpsertLearnerCompetencyDTO) =>
      LearnerCompetencyService.upsertLearnerCompetency(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: learnerCompetencyKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: learnerCompetencyKeys.progress(variables.learner_id)
      });
      queryClient.invalidateQueries({
        queryKey: learnerCompetencyKeys.dashboard(variables.learner_id)
      });
    }
  });
}

/**
 * Add evidence to learner competency
 */
export function useAddCompetencyEvidence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AddCompetencyEvidenceDTO) =>
      LearnerCompetencyService.addEvidence(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: learnerCompetencyKeys.detail(data.id)
      });
      queryClient.invalidateQueries({ queryKey: learnerCompetencyKeys.lists() });
    }
  });
}

/**
 * Record assessment for learner competency
 */
export function useRecordCompetencyAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RecordCompetencyAssessmentDTO) =>
      LearnerCompetencyService.recordAssessment(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: learnerCompetencyKeys.detail(data.id)
      });
      queryClient.invalidateQueries({ queryKey: learnerCompetencyKeys.lists() });
    }
  });
}

/**
 * Verify learner competency
 */
export function useVerifyLearnerCompetency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: VerifyLearnerCompetencyDTO) =>
      LearnerCompetencyService.verifyCompetency(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: learnerCompetencyKeys.detail(data.id)
      });
      queryClient.invalidateQueries({ queryKey: learnerCompetencyKeys.lists() });
    }
  });
}

/**
 * Update learner capabilities summary (after bulk changes)
 */
export function useUpdateLearnerCapabilities() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (learnerId: string) =>
      LearnerCompetencyService.updateLearnerCapabilities(learnerId),
    onSuccess: (_, learnerId) => {
      queryClient.invalidateQueries({
        queryKey: learnerCompetencyKeys.progress(learnerId)
      });
      queryClient.invalidateQueries({
        queryKey: learnerCompetencyKeys.dashboard(learnerId)
      });
      // Also invalidate learner profile if you have a hook for that
    }
  });
}
