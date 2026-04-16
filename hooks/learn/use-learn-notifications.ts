// hooks/learn/use-learn-notifications.ts
// React Query client hook for PDE Learn in-app notifications.
// Pattern mirrors hooks/pde/use-pde.ts (useQuery + useMutation via static service class).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LearnNotificationService } from '@/lib/services/learn/notification-service';

// ============================================
// Query Keys
// ============================================

export const learnNotifKeys = {
  all: ['learn', 'notifications'] as const,
  unread: () => [...learnNotifKeys.all, 'unread'] as const,
  unreadCount: () => [...learnNotifKeys.all, 'unread-count'] as const,
  all_list: (limit?: number) => [...learnNotifKeys.all, 'all', limit] as const,
};

// ============================================
// Queries
// ============================================

/**
 * Unread notifications for the current user (bell dropdown list).
 * Auto-refetches every 60 s so new triggers surface without a page reload.
 */
export function useLearnNotificationsUnread(limit = 20) {
  return useQuery({
    queryKey: learnNotifKeys.unread(),
    queryFn: () => LearnNotificationService.getUnread(limit),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * All notifications (read + unread) for the notification panel / history tab.
 */
export function useLearnNotificationsAll(limit = 50) {
  return useQuery({
    queryKey: learnNotifKeys.all_list(limit),
    queryFn: () => LearnNotificationService.getAll(limit),
    staleTime: 30_000,
  });
}

/**
 * Unread count — used as the numeric badge on the bell icon.
 * Lightweight (count-only) query; refreshes every 60 s.
 */
export function useLearnNotificationsUnreadCount() {
  return useQuery({
    queryKey: learnNotifKeys.unreadCount(),
    queryFn: () => LearnNotificationService.getUnreadCount(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ============================================
// Mutations
// ============================================

/**
 * Mark a single notification as read.
 * Invalidates unread + count queries so the bell badge updates instantly.
 */
export function useMarkLearnNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => LearnNotificationService.markAsRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: learnNotifKeys.unread() });
      qc.invalidateQueries({ queryKey: learnNotifKeys.unreadCount() });
      qc.invalidateQueries({ queryKey: learnNotifKeys.all_list() });
    },
  });
}

/**
 * Mark ALL notifications as read.
 * Called from "Mark all read" button in the notification panel.
 */
export function useMarkAllLearnNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => LearnNotificationService.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: learnNotifKeys.all });
    },
  });
}
