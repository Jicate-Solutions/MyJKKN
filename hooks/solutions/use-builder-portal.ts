'use client';

/**
 * Solutions Hub - Builder Portal Hooks
 * Purpose: React Query hooks for builder portal (talent-facing)
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-builder-portal.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { AssignmentStatus, BuilderRole } from './use-builders';

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BuilderPortalService = any;

const builderPortalService: BuilderPortalService = {
  getBuilderByUserId: async (_userId: string) => {
    throw new Error('builderPortalService.getBuilderByUserId not implemented');
  },
  getMyAssignments: async (_builderId: string, _statusFilter?: AssignmentStatus) => {
    throw new Error('builderPortalService.getMyAssignments not implemented');
  },
  getAvailablePhases: async (_builderId: string) => {
    throw new Error('builderPortalService.getAvailablePhases not implemented');
  },
  claimPhase: async (_phaseId: string, _builderId: string, _role?: BuilderRole) => {
    throw new Error('builderPortalService.claimPhase not implemented');
  },
  startPhaseWork: async (_assignmentId: string) => {
    throw new Error('builderPortalService.startPhaseWork not implemented');
  },
  completePhaseWork: async (_assignmentId: string) => {
    throw new Error('builderPortalService.completePhaseWork not implemented');
  },
  withdrawFromPhase: async (_assignmentId: string) => {
    throw new Error('builderPortalService.withdrawFromPhase not implemented');
  },
  getMySkills: async (_builderId: string) => {
    throw new Error('builderPortalService.getMySkills not implemented');
  },
  addMySkill: async (_builderId: string, _skillName: string, _proficiencyLevel?: number) => {
    throw new Error('builderPortalService.addMySkill not implemented');
  },
  updateMySkillProficiency: async (_skillId: string, _proficiencyLevel: number) => {
    throw new Error('builderPortalService.updateMySkillProficiency not implemented');
  },
  removeMySkill: async (_skillId: string) => {
    throw new Error('builderPortalService.removeMySkill not implemented');
  },
  getMyEarnings: async (_builderId: string) => {
    throw new Error('builderPortalService.getMyEarnings not implemented');
  },
  getPortalOverview: async (_builderId: string) => {
    throw new Error('builderPortalService.getPortalOverview not implemented');
  },
};

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
