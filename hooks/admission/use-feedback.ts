// hooks/admission/use-feedback.ts
// React Query hooks for Feedback Collection module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FeedbackService,
  type FeedbackFilters,
  type FeedbackStats,
} from '@/lib/services/admission/feedback-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const feedbackKeys = {
  all: ['feedback'] as const,
  candidates: (filters: FeedbackFilters) =>
    [...feedbackKeys.all, 'candidates', filters] as const,
  stats: (institutionId: string) =>
    [...feedbackKeys.all, 'stats', institutionId] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Fetch feedback candidates (lost/declined/withdrew leads)
 */
export function useFeedbackCandidates(filters: FeedbackFilters) {
  const query = useQuery({
    queryKey: feedbackKeys.candidates(filters),
    queryFn: () => FeedbackService.getCandidates(filters),
    enabled: !!filters.institutionId,
  });

  return {
    candidates: query.data?.candidates || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch feedback stats
 */
export function useFeedbackStats(institutionId?: string) {
  const query = useQuery({
    queryKey: feedbackKeys.stats(institutionId || ''),
    queryFn: () => FeedbackService.getStats(institutionId!),
    enabled: !!institutionId,
    staleTime: 60000,
  });

  return {
    stats: query.data || {
      totalCandidates: 0,
      respondedCount: 0,
      pendingCount: 0,
      declinedOffer: 0,
      withdrew: 0,
      lost: 0,
      topReasons: [],
    } as FeedbackStats,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Update feedback/lost reason on a lead
 */
export function useUpdateFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      leadId,
      feedbackData,
    }: {
      leadId: string;
      feedbackData: { lost_reason?: string; notes?: string };
    }) => FeedbackService.updateFeedback(leadId, feedbackData),
    onSuccess: () => {
      toast.success('Feedback updated successfully');
      queryClient.invalidateQueries({ queryKey: feedbackKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update feedback');
    },
  });
}
