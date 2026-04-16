'use client';

// hooks/profile/use-profile-notifications.ts
// React Query hooks for reading profile-related in-app notifications.
// These hooks query the notifications + user_notifications tables via
// the existing /api/notifications endpoint (if available) or directly.
//
// Client-side only — safe to call from any 'use client' component.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProfileEventType } from '@/types/profile';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfileNotificationItem {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  action_url?: string | null;
  action_label?: string | null;
  created_at: string;
  metadata?: {
    event_type?: ProfileEventType;
    request_id?: string;
    learner_id?: string;
    decision?: 'approved' | 'rejected';
    source?: string;
    [key: string]: unknown;
  } | null;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const profileNotificationKeys = {
  all: ['profile-notifications'] as const,
  list: (userId?: string) => [...profileNotificationKeys.all, 'list', userId] as const,
  unreadCount: (userId?: string) => [...profileNotificationKeys.all, 'unread-count', userId] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch all profile-related in-app notifications for the current user.
 * Polls the /api/notifications endpoint filtering by category=approval + source=profile_notify.
 *
 * @param userId   Auth user ID (from useAuth / session). Skip if undefined.
 * @param limit    Max notifications to return (default 20).
 */
export function useProfileNotifications(userId?: string, limit = 20) {
  return useQuery({
    queryKey: profileNotificationKeys.list(userId),
    queryFn: async (): Promise<ProfileNotificationItem[]> => {
      if (!userId) return [];

      // Query notifications linked to this user, filtered by profile_notify source
      const params = new URLSearchParams({
        category: 'approval',
        limit: String(limit),
      });

      const res = await fetch(`/api/notifications?${params.toString()}`, {
        cache: 'no-store',
      });

      if (!res.ok) {
        // Graceful degradation — notifications are non-critical
        console.warn('[use-profile-notifications] Failed to fetch notifications:', res.status);
        return [];
      }

      const json = await res.json();

      // Handle both {data: [...]} and direct array shapes
      const items: ProfileNotificationItem[] = Array.isArray(json) ? json : (json?.data ?? []);

      // Filter to profile-sourced notifications only
      return items.filter(
        (n) =>
          n.metadata?.source === 'profile_notify' ||
          (n.metadata?.event_type as string | undefined)?.startsWith('verification') ||
          (n.metadata?.event_type as string | undefined)?.startsWith('profile_change')
      );
    },
    enabled: !!userId,
    staleTime: 30_000, // 30 s
    refetchInterval: 60_000, // poll every 60 s for near-real-time updates
  });
}

/**
 * Count of unread profile notifications for the current user.
 * Derived from useProfileNotifications — no extra network call.
 */
export function useUnreadProfileNotificationCount(userId?: string) {
  const { data = [] } = useProfileNotifications(userId);
  return data.filter((n) => !n.is_read).length;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Mark a single profile notification as read.
 * Calls PATCH /api/notifications/:id or equivalent endpoint.
 */
export function useMarkProfileNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error((error as { error?: string }).error ?? 'Failed to mark notification as read');
      }

      return res.json();
    },
    onSuccess: () => {
      // Invalidate all profile notification queries so badge counts update
      queryClient.invalidateQueries({ queryKey: profileNotificationKeys.all });
    },
    onError: (err: Error) => {
      console.warn('[use-profile-notifications] Mark read failed:', err.message);
    },
  });
}

/**
 * Mark all profile notifications as read for the current user.
 */
export function useMarkAllProfileNotificationsRead(userId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'approval' }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error((error as { error?: string }).error ?? 'Failed to mark all as read');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileNotificationKeys.list(userId) });
    },
    onError: (err: Error) => {
      console.warn('[use-profile-notifications] Mark all read failed:', err.message);
    },
  });
}
