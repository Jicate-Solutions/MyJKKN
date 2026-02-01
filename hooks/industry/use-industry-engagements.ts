// ============================================================================
// React Query hooks for Learner Industry Engagements
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import type {
  LearnerIndustryEngagement,
  IndustryListResponse,
  LearnerEngagementFilters,
  CreateLearnerEngagementDTO,
  UpdateLearnerEngagementDTO,
  EngagementFeedback,
  IndustryStats,
  EngagementStatus
} from '@/types/industry';
import { IndustryEngagementService } from '@/lib/services/industry';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { mentorKeys } from './use-industry-mentors';
import { projectKeys } from './use-industry-projects';

// Query key factory
export const engagementKeys = {
  all: ['industry-engagements'] as const,
  lists: () => [...engagementKeys.all, 'list'] as const,
  list: (filters: LearnerEngagementFilters) => [...engagementKeys.lists(), filters] as const,
  details: () => [...engagementKeys.all, 'detail'] as const,
  detail: (id: string) => [...engagementKeys.details(), id] as const,
  byLearner: (learnerId: string, status?: string | string[]) =>
    [...engagementKeys.all, 'by-learner', learnerId, status || 'all'] as const,
  activeLearner: (learnerId: string) => [...engagementKeys.all, 'active-learner', learnerId] as const,
  stats: (institutionId: string) => [...engagementKeys.all, 'stats', institutionId] as const
};

/**
 * Get engagements with filters and pagination
 */
export function useIndustryEngagements(
  filters: LearnerEngagementFilters = {}
): UseQueryResult<IndustryListResponse<LearnerIndustryEngagement>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters: LearnerEngagementFilters = {
      learner_id: filters.learner_id,
      partner_id: filters.partner_id,
      project_id: filters.project_id,
      mentor_id: filters.mentor_id,
      engagement_type: filters.engagement_type,
      status: filters.status,
      page: filters.page || 1,
      limit: filters.limit || 10
    };
    return engagementKeys.list(stableFilters);
  }, [
    filters.learner_id,
    filters.partner_id,
    filters.project_id,
    filters.mentor_id,
    filters.engagement_type,
    filters.status,
    filters.page,
    filters.limit
  ]);

  const queryFn = useCallback(async () => {
    try {
      return await IndustryEngagementService.getEngagements(filters);
    } catch (error) {
      console.error('[useIndustryEngagements] Fetch error:', error);
      throw new Error('Failed to fetch industry engagements');
    }
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get single engagement by ID
 */
export function useIndustryEngagement(id: string): UseQueryResult<LearnerIndustryEngagement, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: engagementKeys.detail(id),
    queryFn: () => IndustryEngagementService.getEngagementById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get engagements by learner ID
 */
export function useEngagementsByLearner(
  learnerId: string,
  status?: string | string[]
): UseQueryResult<LearnerIndustryEngagement[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: engagementKeys.byLearner(learnerId, status),
    queryFn: () => IndustryEngagementService.getEngagementsByLearnerId(learnerId, status),
    enabled: !authLoading && !!profile && !!learnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get active engagements for learner
 */
export function useActiveLearnerEngagements(
  learnerId: string
): UseQueryResult<LearnerIndustryEngagement[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: engagementKeys.activeLearner(learnerId),
    queryFn: () => IndustryEngagementService.getActiveLearnerEngagements(learnerId),
    enabled: !authLoading && !!profile && !!learnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get industry module statistics
 */
export function useIndustryStats(
  institutionId: string
): UseQueryResult<IndustryStats, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: engagementKeys.stats(institutionId),
    queryFn: () => IndustryEngagementService.getIndustryStats(institutionId),
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Create engagement mutation
 */
export function useCreateEngagement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLearnerEngagementDTO) =>
      IndustryEngagementService.createEngagement(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.lists() });
      queryClient.invalidateQueries({ queryKey: engagementKeys.byLearner(data.learner_id) });
      queryClient.invalidateQueries({ queryKey: engagementKeys.activeLearner(data.learner_id) });
      // Update mentor's mentee count if mentorship
      if (data.mentor_id) {
        queryClient.invalidateQueries({ queryKey: mentorKeys.detail(data.mentor_id) });
        queryClient.invalidateQueries({ queryKey: mentorKeys.options() });
      }
      // Update project engagement count
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: projectKeys.detail(data.project_id) });
        queryClient.invalidateQueries({ queryKey: projectKeys.options() });
      }
    }
  });
}

/**
 * Update engagement mutation
 */
export function useUpdateEngagement(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateLearnerEngagementDTO) =>
      IndustryEngagementService.updateEngagement(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: engagementKeys.lists() });
      queryClient.setQueryData(engagementKeys.detail(id), data);
    }
  });
}

/**
 * Update engagement status mutation
 */
export function useUpdateEngagementStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status, endDate }: { id: string; status: EngagementStatus; endDate?: string }) =>
      IndustryEngagementService.updateEngagementStatus(id, status, endDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.lists() });
      // May need to update mentor counts when completing/terminating
      queryClient.invalidateQueries({ queryKey: mentorKeys.options() });
    }
  });
}

/**
 * Add feedback to engagement mutation
 */
export function useAddEngagementFeedback(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      feedbackType,
      feedback
    }: {
      feedbackType: 'mentor_feedback' | 'learner_feedback' | 'supervisor_feedback';
      feedback: EngagementFeedback[typeof feedbackType];
    }) => IndustryEngagementService.addFeedback(id, feedbackType, feedback),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.detail(id) });
      queryClient.setQueryData(engagementKeys.detail(id), data);
    }
  });
}

/**
 * Log hours mutation
 */
export function useLogEngagementHours(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (hours: number) => IndustryEngagementService.logHours(id, hours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.detail(id) });
    }
  });
}

/**
 * Add demonstrated competency mutation
 */
export function useAddDemonstratedCompetency(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (competencyId: string) =>
      IndustryEngagementService.addDemonstratedCompetency(id, competencyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.detail(id) });
    }
  });
}
