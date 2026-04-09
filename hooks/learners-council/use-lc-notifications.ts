'use client';

// hooks/learners-council/use-lc-notifications.ts
// LC Notifications - React Query Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { LCNotificationService } from '@/lib/services/learners-council/notification-service';
import type { LCNotification, LCNotificationPreference } from '@/types/learners-council';

// ============================================================================
// QUERY KEY FACTORIES
// ============================================================================

export const lcNotificationKeys = {
  all: ['lc-notifications'] as const,
  list: (userId: string, filters?: Record<string, unknown>) =>
    ['lc-notifications', 'list', userId, filters] as const,
  detail: (id: string) => ['lc-notifications', 'detail', id] as const,
  unreadCount: (userId: string) => ['lc-notifications', 'unread-count', userId] as const,
  preferences: (userId: string) => ['lc-notification-preferences', userId] as const
};

// ============================================================================
// NOTIFICATION QUERY HOOKS
// ============================================================================

/**
 * Fetch notifications for a user with optional filters
 */
export function useNotifications(
  userId: string,
  filters?: { type?: string; is_read?: boolean; limit?: number; offset?: number }
) {
  return useQuery({
    queryKey: lcNotificationKeys.list(userId, filters as Record<string, unknown> | undefined),
    queryFn: () => LCNotificationService.getNotifications(userId, filters),
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
    refetchIntervalInBackground: false, // Don't poll when tab is inactive
  });
}

/**
 * Fetch unread notification count for badge display
 */
export function useUnreadNotificationCount(userId: string) {
  return useQuery({
    queryKey: lcNotificationKeys.unreadCount(userId),
    queryFn: () => LCNotificationService.getUnreadCount(userId),
    enabled: !!userId,
    staleTime: 15 * 1000, // 15 seconds for badge freshness
    refetchInterval: 15 * 1000, // Auto-refetch every 15 seconds
    refetchIntervalInBackground: false, // Don't poll when tab is inactive
  });
}

// ============================================================================
// NOTIFICATION MUTATION HOOKS
// ============================================================================

/**
 * Mark a single notification as read
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => LCNotificationService.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lcNotificationKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark notification as read');
    }
  });
}

/**
 * Mark all notifications as read for a user
 */
export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => LCNotificationService.markAllNotificationsRead(userId),
    onSuccess: () => {
      toast.success('All notifications marked as read');
      queryClient.invalidateQueries({ queryKey: lcNotificationKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark all notifications as read');
    }
  });
}

/**
 * Delete a notification
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => LCNotificationService.deleteNotification(id),
    onSuccess: () => {
      toast.success('Notification deleted');
      queryClient.invalidateQueries({ queryKey: lcNotificationKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete notification');
    }
  });
}

// ============================================================================
// NOTIFICATION PREFERENCES HOOKS
// ============================================================================

/**
 * Fetch notification preferences for a user
 */
export function useNotificationPreferences(userId: string) {
  return useQuery({
    queryKey: lcNotificationKeys.preferences(userId),
    queryFn: () => LCNotificationService.getNotificationPreferences(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000 // 5 minutes — preferences rarely change
  });
}

/**
 * Update notification preferences
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, preferences }: {
      userId: string;
      preferences: Partial<{
        announcements: boolean;
        events: boolean;
        approvals: boolean;
        chat: boolean;
        mentions: boolean;
        issues: boolean;
      }>;
    }) => LCNotificationService.updateNotificationPreferences(userId, preferences),
    onSuccess: (_, variables) => {
      toast.success('Notification preferences updated');
      queryClient.invalidateQueries({
        queryKey: lcNotificationKeys.preferences(variables.userId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update notification preferences');
    }
  });
}

/**
 * Fetch a single notification by ID
 */
export function useNotificationDetail(id: string) {
  return useQuery({
    queryKey: lcNotificationKeys.detail(id),
    queryFn: () => LCNotificationService.getNotificationById(id),
    enabled: !!id,
  });
}
