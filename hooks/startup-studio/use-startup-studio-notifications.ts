'use client';

// hooks/startup-studio/use-startup-studio-notifications.ts
// React Query client hook for Startup Studio in-app notifications.
// Follows the same pattern as use-sf100.ts / use-events.ts in this module.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { StartupStudioNotificationService } from '@/lib/services/startup-studio/notification-service';

// ─── Query key ──────────────────────────────────────────────────────────────

const NOTIFICATIONS_KEY = ['startup-studio', 'notifications'] as const;

// ─── Read hooks ─────────────────────────────────────────────────────────────

/**
 * Fetch all (read + unread) startup-studio notifications for the current user.
 * Suitable for the full notification list panel.
 */
export function useStartupStudioNotifications(limit = 50) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'all', limit],
    queryFn: () => StartupStudioNotificationService.getAll(limit),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch only unread startup-studio notifications.
 * Suitable for the bell icon badge / quick dropdown.
 */
export function useStartupStudioUnreadNotifications(limit = 20) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'unread', limit],
    queryFn: () => StartupStudioNotificationService.getUnread(limit),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch the unread count as a number (for bell badge).
 * Refreshes every 60 seconds so the badge stays current.
 */
export function useStartupStudioUnreadCount() {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'count'],
    queryFn: () => StartupStudioNotificationService.getUnreadCount(),
    refetchInterval: 60_000, // 60 s polling interval for live badge
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ─── Mutation hooks ─────────────────────────────────────────────────────────

/**
 * Mark a single notification as read.
 * Invalidates the unread and all-notifications query caches.
 */
export function useMarkStartupStudioNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userNotificationId: string) =>
      StartupStudioNotificationService.markAsRead(userNotificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

/**
 * Mark all unread startup-studio notifications as read.
 * Invalidates the unread and all-notifications query caches.
 */
export function useMarkAllStartupStudioNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => StartupStudioNotificationService.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}
