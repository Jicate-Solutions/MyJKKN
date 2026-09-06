// hooks/notification/use-notifications.ts

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getNotifications,
  getNotification,
  createNotification,
  updateNotification,
  deleteNotification,
  bulkUpdateNotifications,
  markAsRead,
  markAllAsRead,
  archiveNotification,
  deleteAllRead,
  getNotificationStats,
  getUserPreferences,
  createPreference,
  updatePreference,
  deletePreference,
  sendNotification
} from '@/lib/services/notification/notification-service';
import type {
  Notification,
  NotificationFilters,
  CreateNotificationDto,
  UpdateNotificationDto,
  BulkUpdateNotificationDto,
  CreateNotificationPreferenceDto,
  UpdateNotificationPreferenceDto,
  SendNotificationDto
} from '@/types/notification';
import { useToast } from '@/hooks/use-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ==================== QUERY HOOKS ====================

export function useNotifications(filters: NotificationFilters = {}) {
  return useQuery({
    queryKey: ['notifications', filters],
    queryFn: () => getNotifications(filters),
    staleTime: 10 * 1000 // 10 seconds for real-time feel
  });
}

export function useNotification(id: string | undefined) {
  return useQuery({
    queryKey: ['notifications', id],
    queryFn: () => (id ? getNotification(id) : null),
    enabled: !!id,
    staleTime: 30 * 1000
  });
}

/**
 * How many unread rows the bell dropdown actually renders. The badge number
 * does NOT come from this list — see useUnreadNotifications below.
 */
export const UNREAD_PREVIEW_LIMIT = 5;

export interface UnreadNotificationsResult {
  /** The newest unread rows, capped at UNREAD_PREVIEW_LIMIT — a preview, not the inbox. */
  notifications: Notification[];
  /** GLOBAL unread tally from a COUNT query, independent of the preview length. */
  unreadCount: number;
}

/**
 * Unread preview rows + the real global unread count for the header bell.
 *
 * Why this hook fetches the API instead of calling getNotifications() directly:
 * it used to run `getNotifications({ user_id, is_read: false })` with NO limit,
 * so the service applied no range() and every unread row came back FULLY JOINED
 * (notifications + profiles) — on a 30-second poll — only so the bell could read
 * `.length` and render `.slice(0, 5)`. At ~257 unread that is ~257 joined rows
 * every 30s per user, growing without bound as the inbox grows. An array length
 * standing in for a COUNT.
 *
 * GET /api/notifications returns `unread_count` from a real COUNT query that is
 * global by contract (not page-scoped), so the badge stays honest while we fetch
 * only the handful of rows the dropdown renders.
 *
 * The route derives the user from the session cookie; `userId` here gates the
 * query and keys the cache/realtime channel.
 */
export function useUnreadNotifications(userId: string | undefined) {
  const queryClient = useQueryClient();

  // Subscribe to Supabase realtime for instant new notification detection.
  // When a new user_notification row is inserted for this user, immediately
  // invalidate the React Query cache instead of waiting for the 30s poll.
  useEffect(() => {
    if (!userId) return;

    const supabase = createClientSupabaseClient();
    const channel = supabase
      .channel(`unread-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`
        },
        () => {
          // Invalidate both unread and all notification queries so UI updates instantly
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return useQuery<UnreadNotificationsResult>({
    queryKey: ['notifications', 'unread', userId],
    queryFn: async () => {
      // Unread === read_at IS NULL, nothing else. The old call also passed
      // `is_archived: false`, which was a phantom: user_notifications has no
      // is_archived / archived_at column, the service mapper hardcodes
      // is_archived:false on every row, and the filter was silently ignored.
      // It read like an archive feature existed and misled a reviewer into
      // doubting the count. Dropped.
      const params = new URLSearchParams({
        is_read: 'false',
        limit: String(UNREAD_PREVIEW_LIMIT)
      });

      const response = await fetch(`/api/notifications?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch unread notifications');
      }

      const payload = await response.json();
      return {
        notifications: (payload.notifications ?? []) as Notification[],
        // Global by contract. Never fall back to notifications.length — that is
        // the bug this hook exists to avoid; it would silently cap the badge at
        // UNREAD_PREVIEW_LIMIT.
        unreadCount: payload.unread_count ?? 0
      };
    },
    enabled: !!userId,
    // 30s poll retained (2026-08-02 verify pass): user_notifications is NOT
    // in the supabase_realtime publication on prod, so the postgres_changes
    // subscription above never fires there — this poll IS the delivery path,
    // not a fallback. The dedupe win stands regardless: one QueryClient means
    // ONE 30s poller instead of two. staleTime 15s keeps remounts cheap
    // without letting a navigation show a >15s-stale badge.
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000 // primary delivery path in prod (see above)
  });
}

export function useNotificationStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['notifications', 'stats', userId],
    queryFn: () => (userId ? getNotificationStats(userId) : null),
    enabled: !!userId,
    staleTime: 60 * 1000
  });
}

export function useNotificationPreferences(userId: string | undefined) {
  return useQuery({
    queryKey: ['notification-preferences', userId],
    queryFn: () => (userId ? getUserPreferences(userId) : []),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

// ==================== MUTATION HOOKS ====================

export function useCreateNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (dto: CreateNotificationDto) => createNotification(dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Notification sent',
        description: 'The notification has been created successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create notification',
        variant: 'destructive'
      });
    }
  });
}

export function useUpdateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNotificationDto }) =>
      updateNotification(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Notification deleted',
        description: 'The notification has been deleted successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete notification',
        variant: 'destructive'
      });
    }
  });
}

export function useBulkUpdateNotifications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (dto: BulkUpdateNotificationDto) =>
      bulkUpdateNotifications(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Notifications updated',
        description: 'The selected notifications have been updated.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update notifications',
        variant: 'destructive'
      });
    }
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userId: string) => markAllAsRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'All notifications marked as read',
        description: 'All your notifications have been marked as read.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to mark all as read',
        variant: 'destructive'
      });
    }
  });
}

export function useArchiveNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => archiveNotification(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });
}

export function useDeleteAllRead() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userId: string) => deleteAllRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Read notifications deleted',
        description: 'All read notifications have been deleted.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete notifications',
        variant: 'destructive'
      });
    }
  });
}

export function useCreatePreference() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (dto: CreateNotificationPreferenceDto) => createPreference(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast({
        title: 'Preference saved',
        description: 'Your notification preference has been saved.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save preference',
        variant: 'destructive'
      });
    }
  });
}

export function useUpdatePreference() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      id,
      data
    }: {
      id: string;
      data: UpdateNotificationPreferenceDto;
    }) => updatePreference(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast({
        title: 'Preference updated',
        description: 'Your notification preference has been updated.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update preference',
        variant: 'destructive'
      });
    }
  });
}

export function useDeletePreference() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deletePreference(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast({
        title: 'Preference deleted',
        description: 'Your notification preference has been deleted.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete preference',
        variant: 'destructive'
      });
    }
  });
}

export function useSendNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (dto: SendNotificationDto) => sendNotification(dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Notifications sent',
        description: `${data.length} notification(s) have been sent successfully.`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send notifications',
        variant: 'destructive'
      });
    }
  });
}
