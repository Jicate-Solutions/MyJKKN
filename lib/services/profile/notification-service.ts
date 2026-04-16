// lib/services/profile/notification-service.ts
// Client-side wrapper for reading profile-module notifications and invoking
// the server notify route. Follows lib/services/faculty-innovation/notification-service.ts.
//
// Unread reads run under the user's Supabase session (RLS-governed).
// Dispatch goes through /api/profile/notify which holds PROFILE_API_KEY and
// uses the service-role client to write to the core notifications table.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { ProfileNotificationEventType } from '@/types/profile';

export interface ProfileNotificationRow {
  id: string;
  user_id: string;
  notification_id: string;
  read_at: string | null;
  created_at: string;
  notification: {
    id: string;
    type: string;
    title: string;
    body: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  } | null;
}

export class ProfileNotificationService {
  private static supabase = createClientSupabaseClient();

  // ─── DISPATCH ─────────────────────────────────────────────────────────

  /**
   * POST to the server notify route. Intended for server-side callers that
   * hold the PROFILE_API_KEY env var.
   */
  static async notify(
    eventType: ProfileNotificationEventType,
    body: Record<string, unknown>,
    apiKey: string
  ): Promise<{ notified: number }> {
    const res = await fetch(
      `/api/profile/notify?type=${encodeURIComponent(eventType)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`profile/notify failed: ${res.status} ${err}`);
    }
    return (await res.json()) as { notified: number };
  }

  // ─── READ ─────────────────────────────────────────────────────────────

  /** Unread profile-type notifications for the current user. */
  static async getUnread(limit = 20): Promise<ProfileNotificationRow[]> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return [];

    const { data, error } = await (this.supabase as any)
      .from('user_notifications')
      .select(
        `id, user_id, notification_id, read_at, created_at,
         notification:notifications!user_notifications_notification_id_fkey(
           id, type, title, body, metadata, created_at
         )`
      )
      .eq('user_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).filter(
      (r: any) => r.notification?.type === 'profile'
    ) as ProfileNotificationRow[];
  }

  /** All profile-type notifications (read + unread) for the current user. */
  static async getAll(limit = 50): Promise<ProfileNotificationRow[]> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return [];

    const { data, error } = await (this.supabase as any)
      .from('user_notifications')
      .select(
        `id, user_id, notification_id, read_at, created_at,
         notification:notifications!user_notifications_notification_id_fkey(
           id, type, title, body, metadata, created_at
         )`
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).filter(
      (r: any) => r.notification?.type === 'profile'
    ) as ProfileNotificationRow[];
  }

  // ─── WRITE ────────────────────────────────────────────────────────────

  static async markAsRead(userNotificationId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', userNotificationId);
    if (error) throw error;
  }

  static async markAllAsRead(): Promise<void> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    const { error } = await (this.supabase as any)
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) throw error;
  }
}
