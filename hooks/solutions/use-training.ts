'use client';

/**
 * Solutions Hub - Training Hooks
 * Purpose: React Query hooks for training programs, sessions, and cohort members
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-training.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================
// TYPES
// ============================================

export type ProgramType =
  | 'workshop'
  | 'bootcamp'
  | 'certification'
  | 'custom'
  | 'faculty_development'
  | 'corporate'
  | 'academic';

export type CohortLevel = 'observer' | 'co_lead' | 'lead' | 'master';
export type CohortRole = 'observer' | 'co_lead' | 'lead' | 'support';
export type SessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface TrainingProgramFilters {
  solution_id?: string;
  program_type?: ProgramType;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateTrainingProgramInput {
  solution_id: string;
  title: string;
  program_type: ProgramType;
  track?: string;
  participant_count?: number;
  location_preference?: string;
  start_date?: string;
  end_date?: string;
}

export interface UpdateTrainingProgramInput {
  title?: string;
  program_type?: ProgramType;
  track?: string;
  participant_count?: number;
  location_preference?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
}

export interface TrainingSessionFilters {
  program_id?: string;
  status?: SessionStatus;
  session_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateTrainingSessionInput {
  program_id: string;
  session_number: number;
  title?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
}

export interface UpdateTrainingSessionInput {
  title?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  status?: SessionStatus;
  attendance_count?: number;
  notes?: string;
}

export interface CohortMemberFilters {
  department_id?: string;
  level?: CohortLevel;
  track?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateCohortMemberInput {
  user_id?: string;
  name: string;
  email?: string;
  department_id?: string;
  level?: CohortLevel;
  track?: string;
}

export interface UpdateCohortMemberInput {
  name?: string;
  email?: string;
  department_id?: string;
  level?: CohortLevel;
  track?: string;
  is_active?: boolean;
}

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TrainingService = any;

const trainingService: TrainingService = {
  // Training Programs
  getTrainingPrograms: async (_filters?: TrainingProgramFilters) => {
    throw new Error('trainingService.getTrainingPrograms not implemented');
  },
  getTrainingProgramById: async (_id: string) => {
    throw new Error('trainingService.getTrainingProgramById not implemented');
  },
  getTrainingProgramBySolutionId: async (_solutionId: string) => {
    throw new Error('trainingService.getTrainingProgramBySolutionId not implemented');
  },
  createTrainingProgram: async (_input: CreateTrainingProgramInput) => {
    throw new Error('trainingService.createTrainingProgram not implemented');
  },
  updateTrainingProgram: async (_id: string, _input: UpdateTrainingProgramInput) => {
    throw new Error('trainingService.updateTrainingProgram not implemented');
  },
  deleteTrainingProgram: async (_id: string) => {
    throw new Error('trainingService.deleteTrainingProgram not implemented');
  },

  // Training Sessions
  getTrainingSessions: async (_filters?: TrainingSessionFilters) => {
    throw new Error('trainingService.getTrainingSessions not implemented');
  },
  getTrainingSessionById: async (_id: string) => {
    throw new Error('trainingService.getTrainingSessionById not implemented');
  },
  getSessionsByProgramId: async (_programId: string) => {
    throw new Error('trainingService.getSessionsByProgramId not implemented');
  },
  createTrainingSession: async (_input: CreateTrainingSessionInput) => {
    throw new Error('trainingService.createTrainingSession not implemented');
  },
  updateTrainingSession: async (_id: string, _input: UpdateTrainingSessionInput) => {
    throw new Error('trainingService.updateTrainingSession not implemented');
  },
  deleteTrainingSession: async (_id: string) => {
    throw new Error('trainingService.deleteTrainingSession not implemented');
  },
  claimSession: async (_sessionId: string, _cohortMemberId: string, _role?: CohortRole) => {
    throw new Error('trainingService.claimSession not implemented');
  },
  assignSession: async (_sessionId: string, _cohortMemberId: string, _assignedById: string, _role?: CohortRole) => {
    throw new Error('trainingService.assignSession not implemented');
  },
  removeAssignment: async (_sessionId: string, _cohortMemberId: string) => {
    throw new Error('trainingService.removeAssignment not implemented');
  },
  completeSession: async (_sessionId: string, _attendanceCount?: number, _notes?: string) => {
    throw new Error('trainingService.completeSession not implemented');
  },
  canSelfClaimSession: async (_sessionId: string) => {
    throw new Error('trainingService.canSelfClaimSession not implemented');
  },

  // Cohort Members
  getCohortMembers: async (_filters?: CohortMemberFilters) => {
    throw new Error('trainingService.getCohortMembers not implemented');
  },
  getCohortMemberById: async (_id: string) => {
    throw new Error('trainingService.getCohortMemberById not implemented');
  },
  getCohortMemberByUserId: async (_userId: string) => {
    throw new Error('trainingService.getCohortMemberByUserId not implemented');
  },
  createCohortMember: async (_input: CreateCohortMemberInput) => {
    throw new Error('trainingService.createCohortMember not implemented');
  },
  updateCohortMember: async (_id: string, _input: UpdateCohortMemberInput) => {
    throw new Error('trainingService.updateCohortMember not implemented');
  },
  deleteCohortMember: async (_id: string) => {
    throw new Error('trainingService.deleteCohortMember not implemented');
  },
  levelUpCohortMember: async (_id: string) => {
    throw new Error('trainingService.levelUpCohortMember not implemented');
  },
  getCohortMemberStats: async () => {
    throw new Error('trainingService.getCohortMemberStats not implemented');
  },
  getAvailableSessionsForMember: async (_memberId: string) => {
    throw new Error('trainingService.getAvailableSessionsForMember not implemented');
  },
};

// ============================================
// QUERY HOOKS - TRAINING PROGRAMS
// ============================================

/**
 * Fetch all training programs with optional filters
 */
export function useTrainingPrograms(filters?: TrainingProgramFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.trainingPrograms.list(filters),
    queryFn: () => trainingService.getTrainingPrograms(filters),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single training program by ID
 */
export function useTrainingProgram(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.trainingPrograms.detail(id),
    queryFn: () => trainingService.getTrainingProgramById(id),
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
    queryFn: () => trainingService.getTrainingProgramBySolutionId(solutionId),
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
      trainingService.createTrainingProgram(input),
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
      trainingService.updateTrainingProgram(id, input),
    onSuccess: (data) => {
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
    mutationFn: (id: string) => trainingService.deleteTrainingProgram(id),
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
    queryFn: () => trainingService.getTrainingSessions(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single training session by ID
 */
export function useTrainingSession(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.trainingSessions.detail(id),
    queryFn: () => trainingService.getTrainingSessionById(id),
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
    queryFn: () => trainingService.getSessionsByProgramId(programId),
    enabled: !!programId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Check if session can be self-claimed
 */
export function useCanSelfClaimSession(sessionId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.trainingSessions.canSelfClaim(sessionId),
    queryFn: () => trainingService.canSelfClaimSession(sessionId),
    enabled: !!sessionId,
    staleTime: 0,
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
      trainingService.createTrainingSession(input),
    onSuccess: (data) => {
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
      trainingService.updateTrainingSession(id, input),
    onSuccess: (data) => {
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
    mutationFn: (id: string) => trainingService.deleteTrainingSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
    },
  });
}

/**
 * Claim a session (cohort member self-claim)
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
    }) => trainingService.claimSession(sessionId, cohortMemberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
    },
  });
}

/**
 * Assign a cohort member to a session (admin action)
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
    }) => trainingService.assignSession(sessionId, cohortMemberId, assignedById, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
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
    }) => trainingService.removeAssignment(sessionId, cohortMemberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
    },
  });
}

/**
 * Complete a session
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
    }) => trainingService.completeSession(sessionId, attendanceCount, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
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
    queryFn: () => trainingService.getCohortMembers(filters),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single cohort member by ID
 */
export function useCohortMember(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortMembers.detail(id),
    queryFn: () => trainingService.getCohortMemberById(id),
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
    queryFn: () => trainingService.getCohortMemberByUserId(userId),
    enabled: !!userId,
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}

/**
 * Fetch cohort member statistics
 */
export function useCohortMemberStats() {
  return useQuery({
    queryKey: solutionsHubKeys.cohortMembers.stats(),
    queryFn: () => trainingService.getCohortMemberStats(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch available sessions for a member
 */
export function useAvailableSessionsForMember(memberId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortMembers.availableSessions(memberId),
    queryFn: () => trainingService.getAvailableSessionsForMember(memberId),
    enabled: !!memberId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
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
      trainingService.createCohortMember(input),
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
      trainingService.updateCohortMember(id, input),
    onSuccess: (data) => {
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
    mutationFn: (id: string) => trainingService.deleteCohortMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
    },
  });
}

/**
 * Level up a cohort member
 */
export function useLevelUpCohortMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => trainingService.levelUpCohortMember(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.cohortMembers.detail(data.id), data);
      }
    },
  });
}
