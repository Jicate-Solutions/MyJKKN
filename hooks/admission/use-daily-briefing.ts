// hooks/admission/use-daily-briefing.ts
// React Query hooks for Daily Briefing feature

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DailyBriefingService,
  DailyBriefing,
  BriefingRole
} from '@/lib/services/admission/daily-briefing-service';

// Query key factory for briefings
export const dailyBriefingKeys = {
  all: ['daily-briefings'] as const,
  byUser: (userId: string) => [...dailyBriefingKeys.all, 'user', userId] as const,
  byDate: (userId: string, date: string) =>
    [...dailyBriefingKeys.byUser(userId), 'date', date] as const,
  latest: (userId: string) => [...dailyBriefingKeys.byUser(userId), 'latest'] as const,
  unread: (userId: string) => [...dailyBriefingKeys.byUser(userId), 'unread'] as const,
  history: (userId: string) => [...dailyBriefingKeys.byUser(userId), 'history'] as const
};

/**
 * Hook to get today's briefing for a user
 * Optionally generates one if it doesn't exist
 */
export function useDailyBriefing(
  userId: string | undefined,
  institutionId: string | undefined,
  role: BriefingRole | undefined,
  date?: string,
  options?: { autoGenerate?: boolean }
) {
  const briefingDate = date || new Date().toISOString().split('T')[0];
  const autoGenerate = options?.autoGenerate ?? true;

  const query = useQuery({
    queryKey: dailyBriefingKeys.byDate(userId || '', briefingDate),
    queryFn: async () => {
      if (!userId || !institutionId || !role) return null;

      // Try to get existing briefing
      const existing = await DailyBriefingService.getBriefingForUser(userId, briefingDate);

      if (existing) {
        return existing;
      }

      // Generate new briefing if auto-generate is enabled
      if (autoGenerate) {
        return DailyBriefingService.generateBriefing(userId, institutionId, role, briefingDate);
      }

      return null;
    },
    enabled: !!userId && !!institutionId && !!role,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000 // 30 minutes (formerly cacheTime)
  });

  return {
    briefing: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch
  };
}

/**
 * Hook to get the latest briefing for a user
 */
export function useLatestBriefing(userId: string | undefined) {
  const query = useQuery({
    queryKey: dailyBriefingKeys.latest(userId || ''),
    queryFn: async () => {
      if (!userId) return null;
      return DailyBriefingService.getLatestBriefing(userId);
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000
  });

  return {
    briefing: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch
  };
}

/**
 * Hook to get unread briefings for a user
 */
export function useUnreadBriefings(userId: string | undefined) {
  const query = useQuery({
    queryKey: dailyBriefingKeys.unread(userId || ''),
    queryFn: async () => {
      if (!userId) return [];
      return DailyBriefingService.getUnreadBriefings(userId);
    },
    enabled: !!userId,
    staleTime: 1 * 60 * 1000 // 1 minute for unread count
  });

  return {
    unreadBriefings: query.data || [],
    unreadCount: query.data?.length || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch
  };
}

/**
 * Hook to get briefing history for a user
 */
export function useBriefingHistory(userId: string | undefined, limit: number = 30) {
  const query = useQuery({
    queryKey: [...dailyBriefingKeys.history(userId || ''), limit],
    queryFn: async () => {
      if (!userId) return [];
      return DailyBriefingService.getBriefingHistory(userId, limit);
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000 // 10 minutes
  });

  return {
    history: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch
  };
}

/**
 * Hook for briefing mutations
 */
export function useBriefingMutations() {
  const queryClient = useQueryClient();

  const generateBriefing = useMutation({
    mutationFn: async ({
      userId,
      institutionId,
      role,
      date
    }: {
      userId: string;
      institutionId: string;
      role: BriefingRole;
      date?: string;
    }) => {
      return DailyBriefingService.generateBriefing(userId, institutionId, role, date);
    },
    onSuccess: (data) => {
      toast.success('Daily briefing generated');
      queryClient.invalidateQueries({ queryKey: dailyBriefingKeys.byUser(data.user_id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate briefing');
    }
  });

  const markAsRead = useMutation({
    mutationFn: async (briefingId: string) => {
      return DailyBriefingService.markAsRead(briefingId);
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: dailyBriefingKeys.byUser(data.user_id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark briefing as read');
    }
  });

  return {
    generateBriefing,
    markAsRead
  };
}

/**
 * Hook to check if user has unread briefing for today
 */
export function useHasUnreadBriefingToday(userId: string | undefined) {
  const today = new Date().toISOString().split('T')[0];

  const query = useQuery({
    queryKey: [...dailyBriefingKeys.byDate(userId || '', today), 'check'],
    queryFn: async () => {
      if (!userId) return false;
      const briefing = await DailyBriefingService.getBriefingForUser(userId, today);
      return briefing ? !briefing.is_read : false;
    },
    enabled: !!userId,
    staleTime: 1 * 60 * 1000 // Check every minute
  });

  return {
    hasUnreadBriefing: query.data || false,
    isLoading: query.isLoading
  };
}

/**
 * Convenience hook that combines common briefing operations
 */
export function useDailyBriefingDashboard(
  userId: string | undefined,
  institutionId: string | undefined,
  role: BriefingRole | undefined
) {
  const { briefing, isLoading: briefingLoading, refetch } = useDailyBriefing(
    userId,
    institutionId,
    role
  );
  const { unreadCount, isLoading: unreadLoading } = useUnreadBriefings(userId);
  const { markAsRead, generateBriefing } = useBriefingMutations();

  const handleMarkAsRead = async () => {
    if (briefing && !briefing.is_read) {
      await markAsRead.mutateAsync(briefing.id);
    }
  };

  const handleRefreshBriefing = async () => {
    if (userId && institutionId && role) {
      await generateBriefing.mutateAsync({ userId, institutionId, role });
    }
  };

  return {
    briefing,
    unreadCount,
    isLoading: briefingLoading || unreadLoading,
    markAsRead: handleMarkAsRead,
    refreshBriefing: handleRefreshBriefing,
    isMarkingRead: markAsRead.isPending,
    isRefreshing: generateBriefing.isPending,
    refetch
  };
}
