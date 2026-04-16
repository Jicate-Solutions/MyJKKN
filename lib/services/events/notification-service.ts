// lib/services/events/notification-service.ts
// Client-side wrapper for reading events-module notifications and for
// invoking the server notify route.
//
// Follows the pattern of lib/services/faculty-innovation/notification-service.ts.
// Unread reads run under the user's Supabase session (RLS-governed).
// Dispatch goes through the /api/events/notify server route, which uses
// the service-role client to write to the core notifications table.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { EventsNotificationEventType } from '@/types/events';

export interface EventsNotificationRow {
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

export class EventsNotificationService {
  private static supabase = createClientSupabaseClient();

  // ─── DISPATCH ─────────────────────────────────────────────────────────

  /**
   * Post to the server notify route. For server-side callers (API routes,
   * server actions) — the API key is read from `EVENTS_API_KEY`. Client
   * callers should not call this directly; they should trigger a server
   * action that invokes it.
   */
  static async notify(
    eventType: EventsNotificationEventType,
    body: Record<string, unknown>,
    apiKey: string
  ): Promise<{ notified: number }> {
    const res = await fetch(
      `/api/events/notify?type=${encodeURIComponent(eventType)}`,
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
      throw new Error(`events/notify failed: ${res.status} ${err}`);
    }
    return (await res.json()) as { notified: number };
  }

  // ─── READ ─────────────────────────────────────────────────────────────

  /**
   * Get unread events-type notifications for the current user.
   * Filters on `notifications.type === 'events'` after fetching the link
   * rows (PostgREST can't currently filter on a joined non-null column
   * reliably from the user_notifications side).
   */
  static async getUnread(limit = 20): Promise<EventsNotificationRow[]> {
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
      (r: any) => r.notification?.type === 'events'
    ) as EventsNotificationRow[];
  }

  /** Get all events-type notifications (read + unread) for the current user. */
  static async getAll(limit = 50): Promise<EventsNotificationRow[]> {
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
      (r: any) => r.notification?.type === 'events'
    ) as EventsNotificationRow[];
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
