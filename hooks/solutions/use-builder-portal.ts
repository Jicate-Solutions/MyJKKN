'use client';

/**
 * Solutions Hub - Builder Portal Hooks
 * Purpose: React Query hooks for builder portal (talent-facing)
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-builder-portal.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import type { AssignmentStatus, BuilderRole } from './use-builders';

// ============================================
// QUERY HOOKS - PROFILE
// ============================================

/**
 * Get builder profile by user ID (for logged-in user)
 */
export function useBuilderProfile(userId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.builderPortal.profile(userId),
    queryFn: () => apiClient.get('/api/solutions/builder-portal/profile', { params: { userId } }),
    enabled: !!userId,
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}

/**
 * Get portal overview/dashboard data
 */
export function usePortalOverview(builderId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.builderPortal.overview(builderId),
    queryFn: () => apiClient.get('/api/solutions/builder-portal/overview', { params: { builderId } }),
    enabled: !!builderId,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// QUERY HOOKS - ASSIGNMENTS
// ============================================

/**
 * Get my assignments with optional status filter
 */
export function useMyAssignments(builderId: string, statusFilter?: AssignmentStatus) {
  return useQuery({
    queryKey: solutionsHubKeys.builderPortal.assignments(builderId, statusFilter),
    queryFn: () => apiClient.get('/api/solutions/builder-portal/assignments', { params: { builderId, status: statusFilter } }),
    enabled: !!builderId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get available phases to claim
 */
export function useAvailablePhases(builderId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.builderPortal.availablePhases(builderId),
    queryFn: () => apiClient.get('/api/solutions/builder-portal/available-phases', { params: { builderId } }),
    enabled: !!builderId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// QUERY HOOKS - SKILLS
// ============================================

/**
 * Get my skills
 */
export function useMySkills(builderId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.builderPortal.skills(builderId),
    queryFn: () => apiClient.get(`/api/solutions/builders/${builderId}/skills`),
    enabled: !!builderId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// QUERY HOOKS - EARNINGS
// ============================================

/**
 * Get my earnings
 */
export function useMyBuilderEarnings(builderId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.builderPortal.earnings(builderId),
    queryFn: () => apiClient.get('/api/solutions/builder-portal/earnings', { params: { builderId } }),
    enabled: !!builderId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS - PHASE CLAIMING
// ============================================

/**
 * Claim a phase (self-claim workflow)
 */
export function useClaimPhase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      phaseId,
      builderId,
      role,
    }: {
      phaseId: string;
      builderId: string;
      role?: BuilderRole;
    }) => apiClient.post('/api/solutions/builder-portal/claim', { phaseId, builderId, role }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.assignments(variables.builderId),
      });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.availablePhases(variables.builderId),
      });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.overview(variables.builderId),
      });
    },
  });
}

/**
 * Start working on a phase
 */
export function useStartPhaseWork() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      assignmentId,
      builderId,
    }: {
      assignmentId: string;
      builderId: string;
    }) => apiClient.patch('/api/solutions/builder-portal/assignments', { assignmentId, _action: 'start' }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.assignments(variables.builderId),
      });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.overview(variables.builderId),
      });
    },
  });
}

/**
 * Complete phase work
 */
export function useCompletePhaseWork() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      assignmentId,
      builderId,
    }: {
      assignmentId: string;
      builderId: string;
    }) => apiClient.patch('/api/solutions/builder-portal/assignments', { assignmentId, _action: 'complete' }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.assignments(variables.builderId),
      });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.overview(variables.builderId),
      });
    },
  });
}

/**
 * Withdraw from a phase
 */
export function useWithdrawFromPhase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      assignmentId,
      builderId,
    }: {
      assignmentId: string;
      builderId: string;
    }) => apiClient.patch('/api/solutions/builder-portal/assignments', { assignmentId, _action: 'withdraw' }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.assignments(variables.builderId),
      });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.availablePhases(variables.builderId),
      });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.overview(variables.builderId),
      });
    },
  });
}

// ============================================
// MUTATION HOOKS - SKILLS
// ============================================

/**
 * Add a skill to my profile
 */
export function useAddMySkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      builderId,
      skillName,
      proficiencyLevel,
    }: {
      builderId: string;
      skillName: string;
      proficiencyLevel?: number;
    }) => apiClient.post(`/api/solutions/builders/${builderId}/skills`, { skill_name: skillName, proficiency_level: proficiencyLevel }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.skills(variables.builderId),
      });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.profile(variables.builderId),
      });
    },
  });
}

/**
 * Update skill proficiency
 */
export function useUpdateMySkillProficiency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      skillId,
      proficiencyLevel,
      builderId,
    }: {
      skillId: string;
      proficiencyLevel: number;
      builderId: string;
    }) => apiClient.patch(`/api/solutions/builders/${builderId}/skills/${skillId}`, { proficiency_level: proficiencyLevel }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.skills(variables.builderId),
      });
    },
  });
}

/**
 * Remove a skill from my profile
 */
export function useRemoveMySkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ skillId, builderId }: { skillId: string; builderId: string }) =>
      apiClient.delete(`/api/solutions/builders/${builderId}/skills/${skillId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.skills(variables.builderId),
      });
    },
  });
}
