'use client';

/**
 * Solutions Hub - Cohort Portal Hooks
 * Purpose: React Query hooks for cohort member portal (talent-facing)
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-cohort-portal.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { CohortRole } from './use-training';

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CohortPortalService = any;

const cohortPortalService: CohortPortalService = {
  getMyProfile: async (_userId: string) => {
    throw new Error('cohortPortalService.getMyProfile not implemented');
  },
  getMemberById: async (_memberId: string) => {
    throw new Error('cohortPortalService.getMemberById not implemented');
  },
  getAvailableSessions: async (_memberId: string, _level: number) => {
    throw new Error('cohortPortalService.getAvailableSessions not implemented');
  },
  claimSessionAsMember: async (_sessionId: string, _memberId: string, _role: CohortRole) => {
    throw new Error('cohortPortalService.claimSessionAsMember not implemented');
  },
  withdrawFromSession: async (_sessionId: string, _memberId: string) => {
    throw new Error('cohortPortalService.withdrawFromSession not implemented');
  },
  getMySchedule: async (_memberId: string) => {
    throw new Error('cohortPortalService.getMySchedule not implemented');
  },
  getUpcomingSessions: async (_memberId: string) => {
    throw new Error('cohortPortalService.getUpcomingSessions not implemented');
  },
  getCompletedSessions: async (_memberId: string) => {
    throw new Error('cohortPortalService.getCompletedSessions not implemented');
  },
  getMyEarnings: async (_memberId: string) => {
    throw new Error('cohortPortalService.getMyEarnings not implemented');
  },
  getLevelProgress: async (_memberId: string) => {
    throw new Error('cohortPortalService.getLevelProgress not implemented');
  },
  requestLevelUp: async (_memberId: string) => {
    throw new Error('cohortPortalService.requestLevelUp not implemented');
  },
  getDashboardStats: async (_memberId: string) => {
    throw new Error('cohortPortalService.getDashboardStats not implemented');
  },
};

// ============================================
// QUERY HOOKS - PROFILE
// ============================================

/**
 * Get cohort profile by user ID (for logged-in user)
 */
export function useCohortProfile(userId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortPortal.profile(userId),
    queryFn: () => cohortPortalService.getMyProfile(userId),
    enabled: !!userId,
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}

/**
 * Get cohort member by ID
 */
export function useCohortMemberById(memberId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortPortal.member(memberId),
    queryFn: () => cohortPortalService.getMemberById(memberId),
    enabled: !!memberId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// QUERY HOOKS - SESSIONS
// ============================================

/**
 * Get available sessions based on member level
 */
export function useAvailableSessions(memberId: string, level: number) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortPortal.availableSessions(memberId, level),
    queryFn: () => cohortPortalService.getAvailableSessions(memberId, level),
    enabled: !!memberId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get my schedule (all assigned sessions)
 */
export function useMySchedule(memberId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortPortal.schedule(memberId),
    queryFn: () => cohortPortalService.getMySchedule(memberId),
    enabled: !!memberId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get upcoming sessions only
 */
export function useUpcomingSessions(memberId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortPortal.upcoming(memberId),
    queryFn: () => cohortPortalService.getUpcomingSessions(memberId),
    enabled: !!memberId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get completed sessions
 */
export function useCompletedSessions(memberId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortPortal.completed(memberId),
    queryFn: () => cohortPortalService.getCompletedSessions(memberId),
    enabled: !!memberId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// QUERY HOOKS - EARNINGS
// ============================================

/**
 * Get my earnings
 */
export function useMyCohortEarnings(memberId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortPortal.earnings(memberId),
    queryFn: () => cohortPortalService.getMyEarnings(memberId),
    enabled: !!memberId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// QUERY HOOKS - LEVEL PROGRESS
// ============================================

/**
 * Get level progress (sessions observed, co-led, led)
 */
export function useLevelProgress(memberId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortPortal.levelProgress(memberId),
    queryFn: () => cohortPortalService.getLevelProgress(memberId),
    enabled: !!memberId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// QUERY HOOKS - DASHBOARD
// ============================================

/**
 * Get dashboard statistics
 */
export function useDashboardStats(memberId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortPortal.dashboard(memberId),
    queryFn: () => cohortPortalService.getDashboardStats(memberId),
    enabled: !!memberId,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// MUTATION HOOKS - SESSION CLAIMING
// ============================================

/**
 * Claim a session as a cohort member
 */
export function useClaimSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      memberId,
      role,
    }: {
      sessionId: string;
      memberId: string;
      role: CohortRole;
    }) => cohortPortalService.claimSessionAsMember(sessionId, memberId, role),
    onSuccess: () => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortPortal.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
    },
  });
}

/**
 * Withdraw from a session
 */
export function useWithdrawFromSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      memberId,
    }: {
      sessionId: string;
      memberId: string;
    }) => cohortPortalService.withdrawFromSession(sessionId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortPortal.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.trainingSessions.all });
    },
  });
}

// ============================================
// MUTATION HOOKS - LEVEL UP
// ============================================

/**
 * Request level up (automatic promotion based on session counts)
 */
export function useRequestLevelUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) => cohortPortalService.requestLevelUp(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortPortal.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
    },
  });
}
