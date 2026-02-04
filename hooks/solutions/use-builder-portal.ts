'use client';

/**
 * Solutions Hub - Builder Portal Hooks
 * Purpose: React Query hooks for builder portal (talent-facing)
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-builder-portal.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { builderPortalService } from '@/lib/services/solutions/builder-portal-service';
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
    queryFn: () => builderPortalService.getBuilderByUserId(userId),
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
    queryFn: () => builderPortalService.getPortalOverview(builderId),
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
    queryFn: () => builderPortalService.getMyAssignments(builderId, statusFilter),
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
    queryFn: () => builderPortalService.getAvailablePhases(builderId),
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
    queryFn: () => builderPortalService.getMySkills(builderId),
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
    queryFn: () => builderPortalService.getMyEarnings(builderId),
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
    }) => builderPortalService.claimPhase(phaseId, builderId, role),
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
    }) => builderPortalService.startPhaseWork(assignmentId),
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
    }) => builderPortalService.completePhaseWork(assignmentId),
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
    }) => builderPortalService.withdrawFromPhase(assignmentId),
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
    }) => builderPortalService.addMySkill(builderId, skillName, proficiencyLevel),
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
    }) => builderPortalService.updateMySkillProficiency(skillId, proficiencyLevel),
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
      builderPortalService.removeMySkill(skillId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.builderPortal.skills(variables.builderId),
      });
    },
  });
}
