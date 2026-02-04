/**
 * Briefing Notifications Hooks
 *
 * React Query hooks for managing AI-generated briefing notifications
 * in the admission module.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BriefingDeliveryService,
  type BriefingNotification,
  type Briefing,
  type BriefingNotificationFilters
} from '@/lib/services/admission/briefing-delivery-service';

// ============================================
// QUERY KEYS
// ============================================

export const briefingNotificationsKeys = {
  all: ['briefing-notifications'] as const,
  notifications: (userId: string, filters?: Omit<BriefingNotificationFilters, 'user_id'>) =>
    [...briefingNotificationsKeys.all, 'list', userId, filters] as const,
  unreadCount: (userId: string) =>
    [...briefingNotificationsKeys.all, 'unread-count', userId] as const,
  latestUnread: (userId: string) =>
    [...briefingNotificationsKeys.all, 'latest-unread', userId] as const,
  briefing: (briefingId: string) =>
    [...briefingNotificationsKeys.all, 'briefing', briefingId] as const,
  latestBriefing: (institutionId: string) =>
    [...briefingNotificationsKeys.all, 'latest-briefing', institutionId] as const,
  todaysBriefing: (institutionId: string) =>
    [...briefingNotificationsKeys.all, 'todays-briefing', institutionId] as const
};

// ============================================
// NOTIFICATION HOOKS
// ============================================

/**
 * Get briefing notifications for a user
 */
export function useBriefingNotifications(
  userId: string | undefined,
  filters?: Omit<BriefingNotificationFilters, 'user_id'>
) {
  return useQuery({
    queryKey: briefingNotificationsKeys.notifications(userId || '', filters),
    queryFn: () => BriefingDeliveryService.getBriefingNotifications(userId!, filters),
    enabled: !!userId
  });
}

/**
 * Get unread briefing notification count
 */
export function useUnreadBriefingCount(userId: string | undefined) {
  return useQuery({
    queryKey: briefingNotificationsKeys.unreadCount(userId || ''),
    queryFn: () => BriefingDeliveryService.getUnreadBriefingCount(userId!),
    enabled: !!userId,
    // Refetch periodically to catch new briefings
    refetchInterval: 5 * 60 * 1000 // 5 minutes
  });
}

/**
 * Get the latest unread briefing notification
 */
export function useLatestUnreadBriefing(userId: string | undefined) {
  return useQuery({
    queryKey: briefingNotificationsKeys.latestUnread(userId || ''),
    queryFn: () => BriefingDeliveryService.getLatestUnreadBriefing(userId!),
    enabled: !!userId,
    // Refetch periodically to catch new briefings
    refetchInterval: 5 * 60 * 1000 // 5 minutes
  });
}

// ============================================
// BRIEFING HOOKS
// ============================================

/**
 * Get a specific briefing by ID
 */
export function useBriefing(briefingId: string | undefined) {
  return useQuery({
    queryKey: briefingNotificationsKeys.briefing(briefingId || ''),
    queryFn: () => BriefingDeliveryService.getBriefing(briefingId!),
    enabled: !!briefingId
  });
}

/**
 * Get the latest briefing for an institution
 */
export function useLatestBriefing(institutionId: string | undefined) {
  return useQuery({
    queryKey: briefingNotificationsKeys.latestBriefing(institutionId || ''),
    queryFn: () => BriefingDeliveryService.getLatestBriefing(institutionId!),
    enabled: !!institutionId
  });
}

/**
 * Get today's briefing for an institution
 */
export function useTodaysBriefing(institutionId: string | undefined) {
  return useQuery({
    queryKey: briefingNotificationsKeys.todaysBriefing(institutionId || ''),
    queryFn: () => BriefingDeliveryService.getTodaysBriefing(institutionId!),
    enabled: !!institutionId
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Mark a notification as read
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      BriefingDeliveryService.markNotificationRead(notificationId),
    onSuccess: () => {
      // Invalidate all briefing notification queries
      queryClient.invalidateQueries({
        queryKey: briefingNotificationsKeys.all
      });
    },
    onError: (error: Error) => {
      console.error('[admission/briefing-notifications] Error marking as read:', error);
      toast.error('Failed to mark notification as read');
    }
  });
}

/**
 * Mark all notifications as read for a user
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      BriefingDeliveryService.markAllNotificationsRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: briefingNotificationsKeys.all
      });
      toast.success('All notifications marked as read');
    },
    onError: (error: Error) => {
      console.error('[admission/briefing-notifications] Error marking all as read:', error);
      toast.error('Failed to mark all notifications as read');
    }
  });
}

/**
 * Dismiss a notification
 */
export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      BriefingDeliveryService.dismissNotification(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: briefingNotificationsKeys.all
      });
    },
    onError: (error: Error) => {
      console.error('[admission/briefing-notifications] Error dismissing notification:', error);
      toast.error('Failed to dismiss notification');
    }
  });
}

// ============================================
// COMPOSITE HOOKS
// ============================================

/**
 * Combined hook for briefing notification banner
 * Returns everything needed to display and interact with the banner
 */
export function useBriefingBanner(userId: string | undefined) {
  const { data: latestUnread, isLoading: isLoadingNotification } =
    useLatestUnreadBriefing(userId);

  const { data: unreadCount, isLoading: isLoadingCount } =
    useUnreadBriefingCount(userId);

  const markAsRead = useMarkNotificationRead();
  const dismiss = useDismissNotification();

  return {
    notification: latestUnread,
    unreadCount: unreadCount || 0,
    isLoading: isLoadingNotification || isLoadingCount,
    hasUnread: (unreadCount || 0) > 0,
    markAsRead: (notificationId: string) => markAsRead.mutateAsync(notificationId),
    dismiss: (notificationId: string) => dismiss.mutateAsync(notificationId),
    isMarking: markAsRead.isPending,
    isDismissing: dismiss.isPending
  };
}

/**
 * Combined hook for briefing popup/modal
 * Fetches full briefing content when notification is clicked
 */
export function useBriefingPopup(
  notification: BriefingNotification | null | undefined
) {
  const briefingId = notification?.briefing_id;

  const { data: briefing, isLoading } = useBriefing(briefingId);

  const markAsRead = useMarkNotificationRead();

  return {
    briefing,
    notification,
    isLoading,
    markAsRead: () => {
      if (notification?.id) {
        return markAsRead.mutateAsync(notification.id);
      }
    },
    isMarking: markAsRead.isPending
  };
}
