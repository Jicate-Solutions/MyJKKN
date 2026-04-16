'use client';

/**
 * hooks/staff/use-staff-notifications.ts
 *
 * React Query hook for fetching and managing in-app notifications
 * for the current staff member.
 *
 * Reads from user_notifications (joined to notifications) via Supabase client.
 * Includes helpers for marking notifications read and dispatching events
 * via POST /api/staff/notify.
 *
 * Added: 2026-04-16 — Staff Notifications Sprint
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { StaffEventType, StaffNotification, StaffNotifyPayload, StaffNotifyResponse } from '@/types/staff';

// ---------------------------------------------------------------------------
// Supabase raw row shape (user_notifications join notifications)
// ---------------------------------------------------------------------------

interface UserNotificationRow {
  id: string;
  notification_id: string;
  read_at: string | null;
  created_at: string;
  notifications: {
    id: string;
    title: string;
    message: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Query: fetch notifications for current user
// ---------------------------------------------------------------------------

async function fetchStaffNotifications(limit = 50): Promise<StaffNotification[]> {
  const supabase = createClientSupabaseClient();

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) return [];

  const { data, error } = await (supabase as any)
    .from('user_notifications')
    .select(`
      id,
      notification_id,
      read_at,
      created_at,
      notifications (
        id,
        title,
        message,
        metadata,
        created_at
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[use-staff-notifications] fetch error:', error);
    throw error;
  }

  const rows: UserNotificationRow[] = data ?? [];

  // Filter to staff notifications only (source === 'staff_notify')
  return rows
    .filter((row) => {
      const meta = row.notifications?.metadata as Record<string, unknown> | null;
      return meta?.source === 'staff_notify';
    })
    .map((row) => {
      const notif = row.notifications!;
      const meta = (notif.metadata ?? {}) as StaffNotification['metadata'];
      return {
        id: notif.id,
        delivery_id: row.id,
        event_type: (meta.event_type ?? 'leave_submitted') as StaffEventType,
        title: notif.title,
        message: notif.message,
        metadata: meta,
        read_at: row.read_at,
        created_at: row.created_at,
      };
    });
}

// ---------------------------------------------------------------------------
// Hook: useStaffNotifications
// ---------------------------------------------------------------------------

/**
 * Fetch all staff-module in-app notifications for the current user.
 * Automatically polls every 30 s to catch new arrivals.
 */
export function useStaffNotifications(limit = 50) {
  return useQuery({
    queryKey: ['staff-notifications', limit],
    queryFn: () => fetchStaffNotifications(limit),
    refetchInterval: 30_000, // poll every 30 s
    staleTime: 15_000,
  });
}

/**
 * Returns only unread notifications and their count — useful for bell-icon badge.
 */
export function useUnreadStaffNotifications() {
  const { data = [], ...rest } = useStaffNotifications();
  const unread = data.filter((n) => n.read_at === null);
  return { ...rest, unread, unreadCount: unread.length };
}

// ---------------------------------------------------------------------------
// Mutation: mark a single notification as read
// ---------------------------------------------------------------------------

export function useMarkStaffNotificationRead() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();

  return useMutation({
    mutationFn: async (deliveryId: string) => {
      const { error } = await (supabase as any)
        .from('user_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', deliveryId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-notifications'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: mark ALL staff notifications as read for the current user
// ---------------------------------------------------------------------------

export function useMarkAllStaffNotificationsRead() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();

  return useMutation({
    mutationFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      const { error } = await (supabase as any)
        .from('user_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-notifications'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: dispatch a staff notification event via /api/staff/notify
// Intended for admin/HR actions (approvals, schedule assignments, etc.)
// Requires STAFF_NOTIFY_API_KEY to be passed in x-api-key header — server use only.
// Client components should call the API route indirectly (e.g., via a server action).
// Exported here for completeness; primarily for use from server-side code.
// ---------------------------------------------------------------------------

/**
 * Low-level helper to POST to /api/staff/notify.
 * @param payload    Event type + context
 * @param apiKey     STAFF_NOTIFY_API_KEY (server-side only)
 */
export async function dispatchStaffNotification(
  payload: StaffNotifyPayload,
  apiKey: string
): Promise<StaffNotifyResponse> {
  const { type, ...body } = payload;
  const res = await fetch(`/api/staff/notify?type=${type}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `staff/notify failed: ${res.status}`);
  }

  return res.json() as Promise<StaffNotifyResponse>;
}
