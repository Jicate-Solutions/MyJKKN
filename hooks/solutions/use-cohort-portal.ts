'use client';

/**
 * Solutions Hub - Cohort Portal Hooks
 * Purpose: React Query hooks for cohort member portal (talent-facing)
 * Connected to: cohort-service.ts, training-service.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { cohortService, trainingService, earningsService, type CohortTrack } from '@/lib/services/solutions';

// Re-export types
export type { CohortTrack };

// ============================================
// QUERY HOOKS - PROFILE
// ============================================

/**
 * Get cohort profile by user ID (for logged-in user)
 */
export function useCohortProfile(userId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortPortal.profile(userId),
    queryFn: () => cohortService.getCohortMemberByUserId(userId),
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
    queryFn: () => cohortService.getCohortMemberById(memberId),
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
export function useAvailableSessions(memberId: string, level?: number) {
  return useQuery({
    queryKey: solutionsHubKeys.cohortPortal.availableSessions(memberId, level),
    queryFn: () => cohortService.getAvailableSessionsForMember(memberId),
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
    queryFn: async () => {
      const assignments = await cohortService.getAssignmentsByMemberId(memberId);
      // Get session details for each assignment
      const sessionsPromises = assignments.map(async (assignment) => {
        const session = await trainingService.getSessionById(assignment.session_id);
        return {
          ...assignment,
          session,
        };
      });
      return Promise.all(sessionsPromises);
    },
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
    queryFn: async () => {
      const assignments = await cohortService.getAssignmentsByMemberId(memberId);
      const now = new Date();

      // Get session details and filter for upcoming
      const sessionsPromises = assignments.map(async (assignment) => {
        const session = await trainingService.getSessionById(assignment.session_id);
        return {
          ...assignment,
          session,
        };
      });

      const sessionsWithDetails = await Promise.all(sessionsPromises);
      return sessionsWithDetails.filter(
        (s) => s.session && new Date(s.session.scheduled_at) > now
      );
    },
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
    queryFn: async () => {
      const assignments = await cohortService.getAssignmentsByMemberId(memberId);

      // Get session details and filter for completed
      const sessionsPromises = assignments.map(async (assignment) => {
        const session = await trainingService.getSessionById(assignment.session_id);
        return {
          ...assignment,
          session,
        };
      });

      const sessionsWithDetails = await Promise.all(sessionsPromises);
      return sessionsWithDetails.filter(
        (s) => s.session && s.session.status === 'completed'
      );
    },
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
    queryFn: async () => {
      const earnings = await earningsService.getEarningsByRecipient('cohort_member', memberId);
      const member = await cohortService.getCohortMemberById(memberId);

      return {
        total: member?.total_earnings || 0,
        entries: earnings,
        byStatus: {
          pending: earnings.filter((e) => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0),
          processed: earnings.filter((e) => e.status === 'processed').reduce((sum, e) => sum + e.amount, 0),
          paid: earnings.filter((e) => e.status === 'paid').reduce((sum, e) => sum + e.amount, 0),
        },
      };
    },
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
    queryFn: async () => {
      const member = await cohortService.getCohortMemberById(memberId);
      if (!member) return null;

      const levelInfo = cohortService.getLevelInfo(member.level || 0);
      const nextLevel = cohortService.getLevelInfo((member.level || 0) + 1);

      // Calculate progress to next level
      const sessionsForNextLevel: Record<number, number> = {
        0: 5, // Observer -> Co-Lead: 5 sessions
        1: 10, // Co-Lead -> Lead: 10 sessions
        2: 20, // Lead -> Master: 20 sessions
        3: 0, // Already master
      };

      const currentLevel = member.level || 0;
      const currentSessions =
        currentLevel === 0
          ? member.sessions_observed || 0
          : currentLevel === 1
          ? member.sessions_co_led || 0
          : member.sessions_led || 0;

      const sessionsNeeded = sessionsForNextLevel[currentLevel];
      const progress = sessionsNeeded > 0 ? Math.min((currentSessions / sessionsNeeded) * 100, 100) : 100;

      return {
        currentLevel: member.level || 0,
        levelTitle: levelInfo.title,
        levelDescription: levelInfo.description,
        nextLevelTitle: nextLevel.title,
        sessionsObserved: member.sessions_observed || 0,
        sessionsCoLed: member.sessions_co_led || 0,
        sessionsLed: member.sessions_led || 0,
        sessionsNeeded,
        currentSessions,
        progress,
        canLevelUp: progress >= 100 && currentLevel < 3,
      };
    },
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
    queryFn: async () => {
      const member = await cohortService.getCohortMemberById(memberId);
      if (!member) return null;

      const assignments = await cohortService.getAssignmentsByMemberId(memberId);
      const now = new Date();

      // Count upcoming sessions
      const upcomingSessions = await Promise.all(
        assignments.map(async (a) => {
          const session = await trainingService.getSessionById(a.session_id);
          return session;
        })
      );

      const upcoming = upcomingSessions.filter(
        (s) => s && new Date(s.scheduled_at) > now && s.status !== 'completed'
      ).length;

      return {
        level: member.level || 0,
        levelTitle: cohortService.getLevelInfo(member.level || 0).title,
        track: member.track,
        totalEarnings: member.total_earnings || 0,
        sessionsObserved: member.sessions_observed || 0,
        sessionsCoLed: member.sessions_co_led || 0,
        sessionsLed: member.sessions_led || 0,
        totalSessions: (member.sessions_observed || 0) + (member.sessions_co_led || 0) + (member.sessions_led || 0),
        upcomingSessions: upcoming,
        totalAssignments: assignments.length,
      };
    },
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
    mutationFn: async ({
      sessionId,
      memberId,
      role,
    }: {
      sessionId: string;
      memberId: string;
      role: 'observer' | 'co_lead' | 'lead';
    }) => {
      return trainingService.claimSession(sessionId, memberId, role);
    },
    onSuccess: () => {
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
    mutationFn: async ({
      sessionId,
      memberId,
    }: {
      sessionId: string;
      memberId: string;
    }) => {
      return trainingService.removeAssignment(sessionId, memberId);
    },
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
    mutationFn: (memberId: string) => cohortService.levelUpCohortMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortPortal.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
    },
  });
}
