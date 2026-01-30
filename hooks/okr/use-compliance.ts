// hooks/okr/use-compliance.ts
// React Query hooks for OKR Compliance (blocking mechanism, badges)

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import {
  OKRCompliance,
  OKRUserStatus,
  UserBadge
} from '@/types/okr';
import { OKRComplianceService } from '@/lib/services/okr';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory for compliance
export const complianceKeys = {
  all: ['okr-compliance'] as const,
  myStatus: () => [...complianceKeys.all, 'my-status'] as const,
  isBlocked: () => [...complianceKeys.all, 'is-blocked'] as const,
  badge: () => [...complianceKeys.all, 'badge'] as const,
  weekly: (userId: string, week: number, year: number) =>
    [...complianceKeys.all, 'weekly', userId, week, year] as const,
  blocked: (institutionId: string) =>
    [...complianceKeys.all, 'blocked', institutionId] as const,
  atRisk: (institutionId: string) =>
    [...complianceKeys.all, 'at-risk', institutionId] as const,
  history: (userId: string) =>
    [...complianceKeys.all, 'history', userId] as const,
  teamSummary: (managerId: string) =>
    [...complianceKeys.all, 'team-summary', managerId] as const
};

/**
 * Get current user's compliance status
 */
export function useMyComplianceStatus(): UseQueryResult<OKRUserStatus | null, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: complianceKeys.myStatus(),
    queryFn: () => OKRComplianceService.getMyComplianceStatus(),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.REALTIME_DATA // Always check fresh status
  });
}

/**
 * Check if current user is blocked
 */
export function useIsUserBlocked(): UseQueryResult<boolean, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: complianceKeys.isBlocked(),
    queryFn: () => OKRComplianceService.isUserBlocked(),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.REALTIME_DATA
  });
}

/**
 * Get current user's badge
 */
export function useUserBadge(): UseQueryResult<UserBadge, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: complianceKeys.badge(),
    queryFn: () => OKRComplianceService.getUserBadge(),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get compliance record for a specific week
 */
export function useWeeklyCompliance(
  userId: string,
  weekNumber: number,
  year: number
): UseQueryResult<OKRCompliance | null, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: complianceKeys.weekly(userId, weekNumber, year),
    queryFn: () =>
      OKRComplianceService.getWeeklyCompliance(userId, weekNumber, year),
    enabled: !authLoading && !!profile && !!userId && !!weekNumber && !!year,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get all blocked users for an institution
 */
export function useBlockedUsers(
  institutionId: string
): UseQueryResult<OKRUserStatus[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: complianceKeys.blocked(institutionId),
    queryFn: () => OKRComplianceService.getBlockedUsers(institutionId),
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get users at risk (yellow/red badge)
 */
export function useAtRiskUsers(
  institutionId: string
): UseQueryResult<OKRUserStatus[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: complianceKeys.atRisk(institutionId),
    queryFn: () => OKRComplianceService.getAtRiskUsers(institutionId),
    enabled: !authLoading && !!profile && !!institutionId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Unblock user mutation (admin action)
 */
export function useUnblockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      OKRComplianceService.unblockUser(userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: complianceKeys.all });
      queryClient.invalidateQueries({ queryKey: ['okr-team'] });
    }
  });
}

/**
 * Send escalation mutation
 */
export function useSendEscalation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      escalateTo,
      message
    }: {
      userId: string;
      escalateTo: string;
      message: string;
    }) => OKRComplianceService.sendEscalation(userId, escalateTo, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: complianceKeys.all });
    }
  });
}

/**
 * Get compliance history for a user
 */
export function useComplianceHistory(
  userId: string,
  limit = 12
): UseQueryResult<OKRCompliance[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: complianceKeys.history(userId),
    queryFn: () => OKRComplianceService.getComplianceHistory(userId, limit),
    enabled: !authLoading && !!profile && !!userId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get team compliance summary
 */
export function useTeamComplianceSummary(managerId: string): UseQueryResult<
  {
    total: number;
    compliant: number;
    atRisk: number;
    blocked: number;
    pending: number;
  },
  Error
> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: complianceKeys.teamSummary(managerId),
    queryFn: () => OKRComplianceService.getTeamComplianceSummary(managerId),
    enabled: !authLoading && !!profile && !!managerId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Ensure user status record exists
 */
export function useEnsureUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      OKRComplianceService.ensureUserStatus(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: complianceKeys.myStatus() });
    }
  });
}

/**
 * Recalculate user badge
 */
export function useRecalculateBadge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      OKRComplianceService.recalculateBadge(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: complianceKeys.all });
    }
  });
}
