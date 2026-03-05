'use client';

/**
 * Startup Studio - Submission Hooks
 * Purpose: React Query hooks for event submissions and judging
 * Connected to: startup-studio submissions API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// QUERY HOOKS - SUBMISSIONS
// ============================================

/**
 * Fetch all submissions with optional filters
 */
export function useSubmissions(filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.submissions.list(filters),
    queryFn: () => apiClient.get('/api/startup-studio/submissions', { params: filters }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single submission by ID
 */
export function useSubmission(id: string) {
  return useQuery({
    queryKey: startupStudioKeys.submissions.detail(id),
    queryFn: () => apiClient.get(`/api/startup-studio/submissions/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch leaderboard for an event
 */
export function useLeaderboard(eventId: string) {
  return useQuery({
    queryKey: startupStudioKeys.submissions.leaderboard(eventId),
    queryFn: () => apiClient.get(`/api/startup-studio/submissions/leaderboard/${eventId}`),
    enabled: !!eventId,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// MUTATION HOOKS - SUBMISSIONS
// ============================================

/**
 * Create a new submission
 */
export function useCreateSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/submissions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.submissions.all });
    },
  });
}

/**
 * Update an existing submission
 */
export function useUpdateSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/submissions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.submissions.all });
    },
  });
}

/**
 * Delete a submission
 */
export function useDeleteSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/startup-studio/submissions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.submissions.all });
    },
  });
}

/**
 * Submit a submission for review
 */
export function useSubmitForReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/submissions/${id}/submit`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.submissions.all });
    },
  });
}

/**
 * Add a judge score to a submission
 */
export function useAddJudgeScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/submissions/${id}/scores`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.submissions.all });
    },
  });
}

/**
 * Update a judge score
 */
export function useUpdateJudgeScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ scoreId, data }: { scoreId: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/submissions/scores/${scoreId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.submissions.all });
    },
  });
}

/**
 * Update metrics (MRR, paying users, proof) on a submission
 */
export function useUpdateMetrics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { mrr_amount?: number; paying_users_count?: number; proof_urls?: string[] } }) =>
      apiClient.patch(`/api/startup-studio/submissions/${id}/metrics`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.submissions.all });
    },
  });
}
