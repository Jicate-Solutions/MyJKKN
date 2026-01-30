import { useQuery, UseQueryResult } from '@tanstack/react-query';
import {
  Celebration,
  TodayCelebrations,
  CelebrationService
} from '@/lib/services/dashboard/celebration-service';

/**
 * Get today's celebrations (birthdays + work anniversaries)
 */
export function useCelebrationsToday(
  userId: string | null,
  role: string | null
): UseQueryResult<TodayCelebrations, Error> {
  return useQuery({
    queryKey: ['celebrations-today', userId, role],
    queryFn: async () => {
      if (!userId || !role) throw new Error('User ID and role required');
      return CelebrationService.getTodayCelebrations(userId, role);
    },
    enabled: !!userId && !!role,
    staleTime: 15 * 60 * 1000, // 15 minutes
    refetchOnMount: true,
  });
}

/**
 * Get upcoming celebrations in next N days
 */
export function useUpcomingCelebrations(
  institutionId: string | null,
  days: number = 7
): UseQueryResult<Celebration[], Error> {
  return useQuery({
    queryKey: ['celebrations-upcoming', institutionId, days],
    queryFn: async () => {
      if (!institutionId) throw new Error('Institution ID required');
      return CelebrationService.getUpcomingCelebrations(institutionId, days);
    },
    enabled: !!institutionId,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Get user's next celebration
 */
export function useMyCelebration(
  userId: string | null
): UseQueryResult<Celebration | null, Error> {
  return useQuery({
    queryKey: ['my-celebration', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User ID required');
      return CelebrationService.getMyNextCelebration(userId);
    },
    enabled: !!userId,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
