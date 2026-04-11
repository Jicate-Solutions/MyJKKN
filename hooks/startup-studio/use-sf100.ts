'use client';

/**
 * Startup Studio - Solve for 100 (SF100) Hooks
 * Purpose: React Query hooks for SF100 program management,
 *          enrollments, check-ins, paid users, verification,
 *          interviews, pivots, leaderboard, and notifications.
 * Connected to: startup-studio solve-for-100 API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

const BASE = '/api/startup-studio/solve-for-100';

// ============================================
// QUERY HOOKS - SF100
// ============================================

/**
 * Fetch all SF100 programs with optional filters
 */
export function useSF100Programs(filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.programs.list(filters),
    queryFn: () => apiClient.get(BASE + '/programs', { params: filters }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single SF100 program by ID
 */
export function useSF100Program(programId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.programs.detail(programId),
    queryFn: () => apiClient.get(`${BASE}/programs/${programId}`),
    enabled: !!programId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch enrollments for a specific SF100 program
 */
export function useSF100Enrollments(programId: string, filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.enrollments.list(programId, filters),
    queryFn: () =>
      apiClient.get(`${BASE}/programs/${programId}/enrollments`, { params: filters }),
    enabled: !!programId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single SF100 enrollment by ID
 */
export function useSF100Enrollment(enrollmentId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.enrollments.detail(enrollmentId),
    queryFn: () => apiClient.get(`${BASE}/enrollments/${enrollmentId}`),
    enabled: !!enrollmentId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch the current user's SF100 enrollment for a specific program
 */
export function useMySF100Enrollment(programId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.enrollments.my(programId),
    queryFn: () =>
      apiClient.get(`${BASE}/enrollments/my`, { params: { program_id: programId } }),
    enabled: !!programId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch check-ins for a specific SF100 enrollment
 */
export function useSF100CheckIns(enrollmentId: string, filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.checkIns(enrollmentId),
    queryFn: () =>
      apiClient.get(`${BASE}/enrollments/${enrollmentId}/check-ins`, { params: filters }),
    enabled: !!enrollmentId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch paid users for a specific SF100 enrollment
 */
export function useSF100PaidUsers(enrollmentId: string, filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.paidUsers(enrollmentId),
    queryFn: () =>
      apiClient.get(`${BASE}/enrollments/${enrollmentId}/paid-users`, { params: filters }),
    enabled: !!enrollmentId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch the verification queue for a specific SF100 program
 */
export function useSF100VerificationQueue(programId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.verificationQueue(programId),
    queryFn: () =>
      apiClient.get(`${BASE}/verification-queue`, { params: { program_id: programId } }),
    enabled: !!programId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch interviews for a specific SF100 enrollment
 */
export function useSF100Interviews(enrollmentId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.interviews(enrollmentId),
    queryFn: () => apiClient.get(`${BASE}/enrollments/${enrollmentId}/interviews`),
    enabled: !!enrollmentId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch pivots for a specific SF100 enrollment
 */
export function useSF100Pivots(enrollmentId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.pivots(enrollmentId),
    queryFn: () => apiClient.get(`${BASE}/enrollments/${enrollmentId}/pivots`),
    enabled: !!enrollmentId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch the public leaderboard for a specific SF100 program
 */
export function useSF100PublicLeaderboard(programId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.leaderboard(programId),
    queryFn: () =>
      apiClient.get(`${BASE}/leaderboard`, { params: { program_id: programId } }),
    enabled: !!programId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch public stats for a specific SF100 program
 */
export function useSF100PublicStats(programId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.publicStats(programId),
    queryFn: () =>
      apiClient.get(`${BASE}/leaderboard/stats`, { params: { program_id: programId } }),
    enabled: !!programId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch unread notifications for a specific profile
 */
export function useSF100Notifications(profileId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.notifications(profileId),
    queryFn: () =>
      apiClient.get(`${BASE}/notifications`, { params: { unread_only: true } }),
    enabled: !!profileId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch all exercises for a specific SF100 program
 */
export function useSF100Exercises(programId: string, filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.exercises.list(programId, filters),
    queryFn: () =>
      apiClient.get(`${BASE}/exercises`, { params: { program_id: programId, ...filters } }),
    enabled: !!programId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single SF100 exercise by ID
 */
export function useSF100Exercise(exerciseId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.exercises.detail(exerciseId),
    queryFn: () => apiClient.get(`${BASE}/exercises/${exerciseId}`),
    enabled: !!exerciseId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch all team responses for a specific exercise
 */
export function useSF100ExerciseResponses(exerciseId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.exercises.responses(exerciseId),
    queryFn: () => apiClient.get(`${BASE}/exercises/${exerciseId}/responses`),
    enabled: !!exerciseId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a specific team's response for an exercise
 */
export function useTeamExerciseResponse(exerciseId: string, enrollmentId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.exercises.teamResponse(exerciseId, enrollmentId),
    queryFn: () =>
      apiClient.get(`${BASE}/exercises/${exerciseId}/responses/${enrollmentId}`),
    enabled: !!exerciseId && !!enrollmentId,
    retry: false,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch the phase funnel for a specific SF100 program
 */
export function useSF100PhaseFunnel(programId: string) {
  return useQuery({
    queryKey: startupStudioKeys.sf100.programs.funnel(programId),
    queryFn: () => apiClient.get(`${BASE}/programs/${programId}/funnel`),
    enabled: !!programId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// MUTATION HOOKS - SF100
// ============================================

/**
 * Create a new SF100 program
 */
export function useCreateSF100Program() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`${BASE}/programs`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.sf100.programs.all });
    },
  });
}

/**
 * Update an existing SF100 program
 */
export function useUpdateSF100Program(programId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.patch(`${BASE}/programs/${programId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.sf100.programs.all });
      queryClient.invalidateQueries({
        queryKey: startupStudioKeys.sf100.programs.detail(programId),
      });
    },
  });
}

/**
 * Enroll a team in a specific SF100 program
 */
export function useEnrollSF100Team(programId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`${BASE}/programs/${programId}/enrollments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.sf100.enrollments.all });
    },
  });
}

/**
 * Submit a weekly check-in for a specific SF100 enrollment
 */
export function useSubmitSF100CheckIn(enrollmentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`${BASE}/enrollments/${enrollmentId}/check-ins`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: startupStudioKeys.sf100.checkIns(enrollmentId),
      });
      queryClient.invalidateQueries({
        queryKey: startupStudioKeys.sf100.enrollments.detail(enrollmentId),
      });
    },
  });
}

/**
 * Add mentor feedback to a check-in
 * Uses broad invalidation since we don't know the enrollmentId from the checkInId
 */
export function useAddSF100MentorFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ checkInId, ...data }: { checkInId: string } & Record<string, any>) =>
      apiClient.patch(`${BASE}/check-ins/${checkInId}/feedback`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.sf100.all });
    },
  });
}

/**
 * Log a new paid user for a specific SF100 enrollment
 */
export function useLogSF100PaidUser(enrollmentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`${BASE}/enrollments/${enrollmentId}/paid-users`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: startupStudioKeys.sf100.paidUsers(enrollmentId),
      });
      queryClient.invalidateQueries({
        queryKey: startupStudioKeys.sf100.enrollments.detail(enrollmentId),
      });
      // Leaderboard depends on paid user counts
      queryClient.invalidateQueries({
        queryKey: startupStudioKeys.sf100.all,
        predicate: (query) =>
          Array.isArray(query.queryKey) && query.queryKey.includes('leaderboard'),
      });
    },
  });
}

/**
 * Verify (approve/reject) a paid user submission
 */
export function useVerifySF100PaidUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      paidUserId,
      ...data
    }: { paidUserId: string; status: string; rejection_reason?: string }) =>
      apiClient.patch(`${BASE}/paid-users/${paidUserId}/verify`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.sf100.all });
    },
  });
}

/**
 * Mark a paid user as churned
 */
export function useMarkSF100Churned() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ paidUserId, ...data }: { paidUserId: string } & Record<string, any>) =>
      apiClient.patch(`${BASE}/paid-users/${paidUserId}/churn`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.sf100.all });
    },
  });
}

/**
 * Log a customer interview for a specific SF100 enrollment
 */
export function useLogSF100Interview(enrollmentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`${BASE}/enrollments/${enrollmentId}/interviews`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: startupStudioKeys.sf100.interviews(enrollmentId),
      });
    },
  });
}

/**
 * Log a pivot for a specific SF100 enrollment
 */
export function useLogSF100Pivot(enrollmentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`${BASE}/enrollments/${enrollmentId}/pivots`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: startupStudioKeys.sf100.pivots(enrollmentId),
      });
    },
  });
}

/**
 * Request a roster change for a specific SF100 enrollment
 */
export function useRequestSF100RosterChange(enrollmentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`${BASE}/enrollments/${enrollmentId}/roster-changes`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: startupStudioKeys.sf100.enrollments.detail(enrollmentId),
      });
    },
  });
}

/**
 * Create a new exercise for an SF100 program
 */
export function useCreateSF100Exercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`${BASE}/exercises`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.sf100.exercises.all });
    },
  });
}

/**
 * Submit or update a team's response to an exercise
 */
export function useSubmitSF100ExerciseResponse(exerciseId: string, enrollmentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`${BASE}/exercises/${exerciseId}/responses`, {
        enrollment_id: enrollmentId,
        ...data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: startupStudioKeys.sf100.exercises.responses(exerciseId),
      });
      queryClient.invalidateQueries({
        queryKey: startupStudioKeys.sf100.exercises.teamResponse(exerciseId, enrollmentId),
      });
    },
  });
}

/**
 * Graduate an SF100 team (mark enrollment as graduated)
 */
export function useGraduateSF100Team() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ enrollmentId, ...data }: { enrollmentId: string } & Record<string, any>) =>
      apiClient.post(`${BASE}/enrollments/${enrollmentId}/graduate`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.sf100.all });
    },
  });
}
