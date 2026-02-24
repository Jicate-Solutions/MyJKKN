'use client';

/**
 * Solutions Hub - Training Hooks
 * Purpose: React Query hooks for training programs, sessions, and cohort members
 * Connected to: /api/solutions/training/* routes
 *
 * Services Used (utility functions only):
 * - trainingService: getProgramTypeLabel, getSessionStatusInfo
 * - cohortService: getLevelInfo, getTrackDisplayLabel
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import { trainingService, cohortService } from '@/lib/services/solutions';
import type {
  ProgramType,
  CohortTrack,
  LocationPreference,
  SessionStatus,
  TrainingProgram,
  TrainingSession,
  CohortMember,
  CohortAssignment,
} from '@/lib/services/solutions/types';

// ============================================
// RE-EXPORT TYPES
// ============================================

export type { ProgramType, SessionStatus };
export type CohortLevel = 'observer' | 'co_lead' | 'lead' | 'master';
export type CohortRole = 'observer' | 'co_lead' | 'lead' | 'support';

// ============================================
// FILTER TYPES
// ============================================

export interface TrainingProgramFilters {
  [key: string]: unknown;
  solution_id?: string;
  program_type?: ProgramType;
  track?: CohortTrack;
  location_preference?: LocationPreference;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TrainingSessionFilters {
  [key: string]: unknown;
  program_id?: string;
  status?: SessionStatus;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CohortMemberFilters {
  [key: string]: unknown;
  department_id?: string;
  level?: string;
  track?: CohortTrack;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// ============================================
// INPUT TYPES
// ============================================

export interface CreateTrainingProgramInput {
  solution_id: string;
  program_type?: ProgramType;
  track?: CohortTrack;
  participant_count?: number;
  venue?: string;
  location_preference?: LocationPreference;
  start_date?: string;
  end_date?: string;
}

export interface UpdateTrainingProgramInput {
  program_type?: ProgramType;
  track?: CohortTrack;
  participant_count?: number;
  venue?: string;
  location_preference?: LocationPreference;
  start_date?: string;
  end_date?: string;
}

export interface CreateTrainingSessionInput {
  program_id: string;
  session_number?: number;
  title?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  location?: string;
}

export interface UpdateTrainingSessionInput {
  session_number?: number;
  title?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  location?: string;
  google_calendar_event_id?: string;
  status?: SessionStatus;
  attendance_count?: number;
  notes?: string;
}

export interface CreateCohortMemberInput {
  user_id?: string;
  name: string;
  email?: string;
  phone?: string;
  department_id?: string;
  level?: string;
  track?: CohortTrack;
}

export interface UpdateCohortMemberInput {
  name?: string;
  email?: string;
  phone?: string;
  department_id?: string;
  level?: string;
  track?: CohortTrack;
  is_active?: boolean;
}

// ============================================
// QUERY HOOKS - TRAINING PROGRAMS
// ============================================

/**
 * Fetch all training programs with optional filters
 */
export function useTrainingPrograms(filters?: TrainingProgramFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.trainingPrograms.list(filters),
    queryFn: () => apiClient.get<TrainingProgram[]>('/api/solutions/training/programs', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single training program by ID
 */
export function useTrainingProgram(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.trainingPrograms.detail(id),
    queryFn: () => apiClient.get<TrainingProgram>(`/api/solutions/training/programs/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch training program by solution ID
 */
export function useTrainingProgramBySolution(solutionId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.trainingPrograms.bySolution(solutionId),
    queryFn: () => apiClient.get<TrainingProgram[]>('/api/solutions/training/programs', { params: { solution_id: solutionId } }),
    enabled: !!solutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS - TRAINING PROGRAMS
// ============================================

/**
 * Create a new training program
 */
export function useCreateTrainingProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTrainingProgramInput) =>
      apiClient.post<TrainingProgram>('/api/solutions/training/programs', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingPrograms.all });
    },
  });
}

/**
 * Update an existing training program
 */
export function useUpdateTrainingProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTrainingProgramInput }) =>
      apiClient.patch<TrainingProgram>(`/api/solutions/training/programs/${id}`, input),
    onSuccess: (data: TrainingProgram) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingPrograms.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.trainingPrograms.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete a training program
 */
export function useDeleteTrainingProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/training/programs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingPrograms.all });
    },
  });
}

// ============================================
// QUERY HOOKS - TRAINING SESSIONS
// ============================================

/**
 * Fetch all training sessions with optional filters
 */
export function useTrainingSessions(filters?: TrainingSessionFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.trainingSessions.list(filters),
    queryFn: () => apiClient.get<TrainingSession[]>('/api/solutions/training/sessions', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single training session by ID
 */
export function useTrainingSession(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.trainingSessions.detail(id),
    queryFn: () => apiClient.get<TrainingSession>(`/api/solutions/training/sessions/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch sessions by program ID
 */
export function useSessionsByProgram(programId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.trainingSessions.byProgram(programId),
    queryFn: () => apiClient.get<TrainingSession[]>('/api/solutions/training/sessions', { params: { program_id: programId } }),
    enabled: !!programId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Check if session can be self-claimed (based on 2L threshold)
 */
export function useCanSelfClaimSession(sessionId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.trainingSessions.canSelfClaim(sessionId),
    queryFn: async () => {
      const result = await apiClient.get<{ canClaim: boolean }>(`/api/solutions/training/sessions/${sessionId}/can-claim`);
      return result.canClaim;
    },
    enabled: !!sessionId,
    staleTime: 0,
  });
}

/**
 * Get upcoming sessions for dashboard
 */
export function useUpcomingTrainingSessions() {
  return useQuery({
    queryKey: [...solutionsHubKeys.trainingSessions.all, 'upcoming'],
    queryFn: () => apiClient.get<TrainingSession[]>('/api/solutions/training/sessions', {
      params: {
        status: 'scheduled',
        from_date: new Date().toISOString(),
      },
    }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// MUTATION HOOKS - TRAINING SESSIONS
// ============================================

/**
 * Create a new training session
 */
export function useCreateTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTrainingSessionInput) =>
      apiClient.post<TrainingSession>('/api/solutions/training/sessions', input),
    onSuccess: (data: TrainingSession) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
      if (data?.program_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.trainingSessions.byProgram(data.program_id),
        });
      }
    },
  });
}

/**
 * Update an existing training session
 */
export function useUpdateTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTrainingSessionInput }) =>
      apiClient.patch<TrainingSession>(`/api/solutions/training/sessions/${id}`, input),
    onSuccess: (data: TrainingSession) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.trainingSessions.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete a training session
 */
export function useDeleteTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/training/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
    },
  });
}

/**
 * Claim a session (cohort member self-claim)
 * Business Rule: <=2L self-claim allowed, >2L needs MD approval
 */
export function useClaimSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      cohortMemberId,
      role,
    }: {
      sessionId: string;
      cohortMemberId: string;
      role?: CohortRole;
    }) => apiClient.post(`/api/solutions/training/sessions/${sessionId}/claim`, { cohort_member_id: cohortMemberId, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortPortal.all });
    },
  });
}

/**
 * Assign a cohort member to a session (admin/HOD action)
 */
export function useAssignSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      cohortMemberId,
      assignedById,
      role,
    }: {
      sessionId: string;
      cohortMemberId: string;
      assignedById: string;
      role?: CohortRole;
    }) => apiClient.post(`/api/solutions/training/sessions/${sessionId}/assign`, { cohort_member_id: cohortMemberId, assigned_by: assignedById, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortPortal.all });
    },
  });
}

/**
 * Remove a cohort member from a session
 */
export function useRemoveAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      cohortMemberId,
    }: {
      sessionId: string;
      cohortMemberId: string;
    }) => apiClient.post(`/api/solutions/training/sessions/${sessionId}/unassign`, { cohort_member_id: cohortMemberId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortPortal.all });
    },
  });
}

/**
 * Complete a session and update cohort member stats
 */
export function useCompleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      attendanceCount,
      notes,
    }: {
      sessionId: string;
      attendanceCount?: number;
      notes?: string;
    }) => apiClient.patch<TrainingSession>(`/api/solutions/training/sessions/${sessionId}`, { status: 'completed', attendance_count: attendanceCount, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortPortal.all });
      // Also invalidate earnings as session completion triggers earnings calculation
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}

// ============================================
// QUERY HOOKS - COHORT MEMBERS
// ============================================

/**
 * Fetch all cohort members with optional filters
 */
export function useCohortMembers(filters?: CohortMemberFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortMembers.list(filters),
    queryFn: () => apiClient.get<CohortMember[]>('/api/solutions/training/cohort', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single cohort member by ID
 */
export function useCohortMember(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortMembers.detail(id),
    queryFn: () => apiClient.get<CohortMember>(`/api/solutions/training/cohort/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch cohort member by user ID
 */
export function useCohortMemberByUser(userId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortMembers.byUser(userId),
    queryFn: () => apiClient.get<CohortMember>('/api/solutions/training/cohort/by-user', { params: { user_id: userId } }),
    enabled: !!userId,
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}

/**
 * Fetch cohort member statistics
 * Returns: total, byLevel, byTrack, activeMembers
 */
export function useCohortMemberStats() {
  return useQuery({
    queryKey: solutionsHubKeys.cohortMembers.stats(),
    queryFn: () => apiClient.get('/api/solutions/training/cohort', { params: { stats: 'true' } }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch available sessions for a member to claim
 */
export function useAvailableSessionsForMember(memberId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortMembers.availableSessions(memberId),
    queryFn: () => apiClient.get(`/api/solutions/training/cohort/${memberId}/available-sessions`),
    enabled: !!memberId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch assignments for a cohort member
 */
export function useCohortMemberAssignments(memberId: string) {
  return useQuery({
    queryKey: [...solutionsHubKeys.cohortMembers.detail(memberId), 'assignments'],
    queryFn: () => apiClient.get<CohortAssignment[]>(`/api/solutions/training/cohort/${memberId}/assignments`),
    enabled: !!memberId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS - COHORT MEMBERS
// ============================================

/**
 * Create a new cohort member
 */
export function useCreateCohortMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCohortMemberInput) =>
      apiClient.post<CohortMember>('/api/solutions/training/cohort', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
    },
  });
}

/**
 * Update an existing cohort member
 */
export function useUpdateCohortMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCohortMemberInput }) =>
      apiClient.patch<CohortMember>(`/api/solutions/training/cohort/${id}`, input),
    onSuccess: (data: CohortMember) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.cohortMembers.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete a cohort member
 */
export function useDeleteCohortMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/training/cohort/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
    },
  });
}

/**
 * Level up a cohort member (0->1->2->3)
 * Levels: 0=Observer, 1=Co-Lead, 2=Lead, 3=Master Trainer
 */
export function useLevelUpCohortMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => cohortService.levelUpCohortMember(id),
    onSuccess: (data: CohortMember) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortPortal.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.cohortMembers.detail(data.id), data);
      }
    },
  });
}

/**
 * Add earnings to a cohort member
 */
export function useAddCohortMemberEarnings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      cohortService.addEarnings(id, amount),
    onSuccess: (data: CohortMember) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.cohortMembers.detail(data.id), data);
      }
    },
  });
}

/**
 * Update cohort assignment (earnings, rating, feedback)
 */
export function useUpdateCohortAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { earnings?: number; rating?: number; feedback?: string };
    }) => cohortService.updateAssignment(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortPortal.all });
    },
  });
}

// ============================================
// HELPER EXPORTS
// ============================================

/**
 * Re-export label helpers from services
 */
export {
  PROGRAM_TYPE_LABELS,
  TRACK_LABELS,
  LOCATION_PREFERENCE_LABELS,
  SESSION_STATUS_INFO,
} from '@/lib/services/solutions/training-service';

export {
  COHORT_LEVELS,
  LEVEL_COLORS,
} from '@/lib/services/solutions/cohort-service';

/**
 * Get level info helper
 */
export const getLevelInfo = cohortService.getLevelInfo;

/**
 * Get track display label helper
 */
export const getTrackDisplayLabel = cohortService.getTrackDisplayLabel;

/**
 * Get program type label helper
 */
export const getProgramTypeLabel = trainingService.getProgramTypeLabel;

/**
 * Get session status info helper
 */
export const getSessionStatusInfo = trainingService.getSessionStatusInfo;
