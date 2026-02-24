'use client';

/**
 * Solutions Hub - Cohort Portal Hooks
 * Purpose: React Query hooks for cohort member portal (talent-facing)
 * Connected to: /api/solutions/cohort-portal/* routes, /api/solutions/training/* routes
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import { cohortService, type CohortTrack } from '@/lib/services/solutions';
import type { TrainingSession, CohortAssignment } from '@/lib/services/solutions/types';

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
    queryFn: () => apiClient.get('/api/solutions/cohort-portal/profile'),
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
    queryFn: () => apiClient.get(`/api/solutions/training/cohort/${memberId}`),
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
    queryFn: () => apiClient.get<TrainingSession[]>('/api/solutions/cohort-portal/sessions'),
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
      const assignments = await apiClient.get<CohortAssignment[]>('/api/solutions/cohort-portal/sessions', { params: { view: 'assignments' } });
      // Get session details for each assignment
      const sessionsPromises = assignments.map(async (assignment) => {
        const session = await apiClient.get<TrainingSession>(`/api/solutions/training/sessions/${assignment.session_id}`);
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
      const assignments = await apiClient.get<CohortAssignment[]>('/api/solutions/cohort-portal/sessions', { params: { view: 'assignments' } });
      const now = new Date();

      // Get session details and filter for upcoming
      const sessionsPromises = assignments.map(async (assignment) => {
        const session = await apiClient.get<TrainingSession>(`/api/solutions/training/sessions/${assignment.session_id}`);
        return {
          ...assignment,
          session,
        };
      });

      const sessionsWithDetails = await Promise.all(sessionsPromises);
      return sessionsWithDetails.filter(
        (s) => s.session && s.session.session_date && new Date(s.session.session_date + 'T00:00:00') > now
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
      const assignments = await apiClient.get<CohortAssignment[]>('/api/solutions/cohort-portal/sessions', { params: { view: 'assignments' } });

      // Get session details and filter for completed
      const sessionsPromises = assignments.map(async (assignment) => {
        const session = await apiClient.get<TrainingSession>(`/api/solutions/training/sessions/${assignment.session_id}`);
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
      const result = await apiClient.get<{ total_earnings: number; assignments: any[] }>('/api/solutions/cohort-portal/earnings');
      const member = await apiClient.get<any>(`/api/solutions/training/cohort/${memberId}`);

      const entries = result.assignments || [];
      return {
        total: member?.total_earnings || 0,
        entries,
        byStatus: {
          pending: entries.filter((e: any) => e.status === 'pending').reduce((sum: number, e: any) => sum + (e.amount || 0), 0),
          processed: entries.filter((e: any) => e.status === 'processed').reduce((sum: number, e: any) => sum + (e.amount || 0), 0),
          paid: entries.filter((e: any) => e.status === 'paid').reduce((sum: number, e: any) => sum + (e.amount || 0), 0),
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
      const member = await apiClient.get<any>(`/api/solutions/training/cohort/${memberId}`);
      if (!member) return null;

      const LEVEL_ORDER = ['observer', 'co_lead', 'lead', 'master'];
      const currentLevel = member.level || 'observer';
      const currentIndex = LEVEL_ORDER.indexOf(currentLevel);
      const nextLevelKey = currentIndex < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[currentIndex + 1] : null;

      const levelInfo = cohortService.getLevelInfo(currentLevel);
      const nextLevel = cohortService.getLevelInfo(nextLevelKey);

      // Calculate progress to next level
      const sessionsForNextLevel: Record<string, number> = {
        observer: 5, // Observer -> Co-Lead: 5 sessions
        co_lead: 10, // Co-Lead -> Lead: 10 sessions
        lead: 20, // Lead -> Master: 20 sessions
        master: 0, // Already master
      };

      const currentSessions =
        currentLevel === 'observer'
          ? member.sessions_observed || 0
          : currentLevel === 'co_lead'
          ? member.sessions_co_led || 0
          : member.sessions_led || 0;

      const sessionsNeeded = sessionsForNextLevel[currentLevel] || 0;
      const progress = sessionsNeeded > 0 ? Math.min((currentSessions / sessionsNeeded) * 100, 100) : 100;

      return {
        currentLevel,
        levelTitle: levelInfo.title,
        levelDescription: levelInfo.description,
        nextLevelTitle: nextLevel.title,
        sessionsObserved: member.sessions_observed || 0,
        sessionsCoLed: member.sessions_co_led || 0,
        sessionsLed: member.sessions_led || 0,
        sessionsNeeded,
        currentSessions,
        progress,
        canLevelUp: progress >= 100 && currentLevel !== 'master',
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
      const member = await apiClient.get<any>(`/api/solutions/training/cohort/${memberId}`);
      if (!member) return null;

      const assignments = await apiClient.get<CohortAssignment[]>('/api/solutions/cohort-portal/sessions', { params: { view: 'assignments' } });
      const now = new Date();

      // Count upcoming sessions
      const upcomingSessions = await Promise.all(
        assignments.map(async (a) => {
          const session = await apiClient.get<TrainingSession>(`/api/solutions/training/sessions/${a.session_id}`);
          return session;
        })
      );

      const upcoming = upcomingSessions.filter(
        (s) => s && s.session_date && new Date(s.session_date + 'T00:00:00') > now && s.status !== 'completed'
      ).length;

      return {
        level: member.level || 'observer',
        levelTitle: cohortService.getLevelInfo(member.level || 'observer').title,
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
      return apiClient.post('/api/solutions/cohort-portal/claim', { session_id: sessionId, role });
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
      return apiClient.post(`/api/solutions/training/sessions/${sessionId}/unassign`, { cohort_member_id: memberId });
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
    mutationFn: (memberId: string) => apiClient.post(`/api/solutions/training/cohort/${memberId}/level-up`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortPortal.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.cohortMembers.all });
    },
  });
}
