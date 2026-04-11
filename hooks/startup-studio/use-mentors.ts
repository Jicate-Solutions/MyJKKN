'use client';

/**
 * Startup Studio - Mentor Ecosystem Hooks
 * Purpose: React Query hooks for mentor management, matching, and session tracking
 * Connected to: startup-studio mentors API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// QUERY HOOKS - MENTORS
// ============================================

/**
 * Fetch all mentors with optional filters
 */
export function useMentors(filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.mentors.list(filters),
    queryFn: () => apiClient.get('/api/startup-studio/mentors', { params: filters }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single mentor by ID (with matches)
 */
export function useMentor(id: string) {
  return useQuery({
    queryKey: startupStudioKeys.mentors.detail(id),
    queryFn: () => apiClient.get(`/api/startup-studio/mentors/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch mentor matches for a NIF candidate
 */
export function useMentorMatches(candidateId: string) {
  return useQuery({
    queryKey: startupStudioKeys.mentors.matches(candidateId),
    queryFn: () => apiClient.get(`/api/startup-studio/nif/${candidateId}/mentors`),
    enabled: !!candidateId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch session history for a match
 */
export function useMentorSessions(matchId: string) {
  return useQuery({
    queryKey: startupStudioKeys.mentors.sessions(matchId),
    queryFn: () => apiClient.get(`/api/startup-studio/mentors/matches/${matchId}/sessions`),
    enabled: !!matchId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch suggested mentors for a NIF candidate
 */
export function useSuggestedMentors(candidateId: string) {
  return useQuery({
    queryKey: startupStudioKeys.mentors.suggestions(candidateId),
    queryFn: () => apiClient.get(`/api/startup-studio/nif/${candidateId}/mentors/suggest`),
    enabled: !!candidateId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch mentor dashboard aggregated data
 */
export function useMentorDashboard() {
  return useQuery({
    queryKey: startupStudioKeys.mentors.dashboard(),
    queryFn: () => apiClient.get('/api/startup-studio/mentors/dashboard'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// MUTATION HOOKS - MENTORS
// ============================================

/**
 * Create a new mentor
 */
export function useCreateMentor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/mentors', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.mentors.all });
    },
  });
}

/**
 * Update an existing mentor
 */
export function useUpdateMentor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/mentors/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.mentors.all });
    },
  });
}

/**
 * Onboard a mentor (set status to 'onboarded')
 */
export function useOnboardMentor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/api/startup-studio/mentors/${id}/onboard`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.mentors.all });
    },
  });
}

/**
 * Create a mentor-candidate match
 */
export function useCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ candidateId, data }: { candidateId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/nif/${candidateId}/mentors`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.mentors.all });
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.nif.all });
    },
  });
}

/**
 * Update match status (active, paused, completed, terminated)
 */
export function useUpdateMatchStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ matchId, data }: { matchId: string; data: { status: string; reason?: string } }) =>
      apiClient.patch(`/api/startup-studio/mentors/matches/${matchId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.mentors.all });
    },
  });
}

/**
 * Log a mentoring session
 */
export function useLogSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ matchId, data }: { matchId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/mentors/matches/${matchId}/sessions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.mentors.all });
    },
  });
}
