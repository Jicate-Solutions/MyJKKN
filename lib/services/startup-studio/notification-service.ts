// lib/services/startup-studio/notification-service.ts
// Static-class wrapper for Startup Studio in-app notifications.
// Follows the FacultyInnovationNotificationService shape — same method signatures,
// same table access pattern.
// v1: channels=['in_app'] only.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  StartupStudioEventType,
  StartupStudioNotification,
} from '@/types/startup-studio';

export class StartupStudioNotificationService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // CREATE
  // --------------------------------------------------------------------------

  /**
   * Create a single in-app notification for a user.
   * Used internally by service methods and route handlers that hold a
   * client-side session (e.g. team leader accepting an invite).
   *
   * For server-side bulk dispatch (cron / API routes), call the
   * /api/startup-studio/notify route instead — it uses the service-role client.
   */
  static async create(params: {
    user_id: string;
    event_type: StartupStudioEventType;
    event_id?: string;
    enrollment_id?: string;
    registration_id?: string;
    title: string;
    message: string;
  }): Promise<void> {
    const insert = {
      type: 'startup_studio',
      title: params.title,
      message: params.message,
      metadata: {
        source: 'startup_studio_notify',
        event_type: params.event_type,
        ...(params.event_id ? { event_id: params.event_id } : {}),
        ...(params.enrollment_id ? { enrollment_id: params.enrollment_id } : {}),
        ...(params.registration_id ? { registration_id: params.registration_id } : {}),
      },
    };

    const { data: notification, error: insertError } = await (this.supabase as any)
      .from('notifications')
      .insert(insert)
      .select('id')
      .single();

    if (insertError || !notification) {
      console.error('[startup-studio/notifications] create failed:', insertError);
      throw insertError ?? new Error('Notification insert returned no data');
    }

    const { error: linkError } = await (this.supabase as any)
      .from('user_notifications')
      .insert({ notification_id: notification.id, user_id: params.user_id });

    if (linkError) {
      console.error('[startup-studio/notifications] user_notification link failed:', linkError);
      throw linkError;
    }
  }

  /**
   * Create notifications for multiple users at once.
   * One shared notification row, N user_notification link rows.
   */
  static async createBulk(
    notifications: Array<{
      user_id: string;
      event_type: StartupStudioEventType;
      event_id?: string;
      enrollment_id?: string;
      registration_id?: string;
      title: string;
      message: string;
    }>
  ): Promise<void> {
    if (notifications.length === 0) return;

    for (const n of notifications) {
      await this.create(n);
    }
  }

  // --------------------------------------------------------------------------
  // READ
  // --------------------------------------------------------------------------

  /**
   * Get unread startup-studio notifications for the authenticated user.
   * Joins notifications + user_notifications to build StartupStudioNotification rows.
   */
  static async getUnread(limit = 20): Promise<StartupStudioNotification[]> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return [];

    const { data, error } = await (this.supabase as any)
      .from('user_notifications')
      .select(
        'id, user_id, read_at, notification:notifications(id, type, title, message, metadata, created_at)'
      )
      .eq('user_id', userId)
      .eq('notification.type', 'startup_studio')
      .is('read_at', null)
      .order('notification(created_at)', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[startup-studio/notifications] getUnread error:', error);
      throw error;
    }

    return this._mapRows(data ?? []);
  }

  /**
   * Get all startup-studio notifications (read + unread) for the authenticated user.
   */
  static async getAll(limit = 50): Promise<StartupStudioNotification[]> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return [];

    const { data, error } = await (this.supabase as any)
      .from('user_notifications')
      .select(
        'id, user_id, read_at, notification:notifications(id, type, title, message, metadata, created_at)'
      )
      .eq('user_id', userId)
      .eq('notification.type', 'startup_studio')
      .order('notification(created_at)', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[startup-studio/notifications] getAll error:', error);
      throw error;
    }

    return this._mapRows(data ?? []);
  }

  /**
   * Get unread count (for bell icon badge).
   */
  static async getUnreadCount(): Promise<number> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return 0;

    // We need to join through user_notifications → notifications filtered by type
    // Use a two-step approach: get notification ids of type startup_studio first
    const { data: notifIds } = await (this.supabase as any)
      .from('notifications')
      .select('id')
      .eq('type', 'startup_studio');

    if (!notifIds || notifIds.length === 0) return 0;

    const ids = notifIds.map((n: { id: string }) => n.id);

    const { count, error } = await (this.supabase as any)
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('notification_id', ids)
      .is('read_at', null);

    if (error) {
      console.error('[startup-studio/notifications] getUnreadCount error:', error);
      return 0;
    }

    return count ?? 0;
  }

  // --------------------------------------------------------------------------
  // MARK READ
  // --------------------------------------------------------------------------

  /**
   * Mark a single user_notification row as read (by user_notification id).
   */
  static async markAsRead(userNotificationId: string): Promise<void> {
    if (!userNotificationId) throw new Error('user_notification id required');

    const { error } = await (this.supabase as any)
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', userNotificationId);

    if (error) {
      console.error('[startup-studio/notifications] markAsRead error:', error);
      throw error;
    }
  }

  /**
   * Mark all unread startup-studio notifications as read for the current user.
   */
  static async markAllRead(): Promise<void> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    // Get startup_studio notification ids
    const { data: notifIds } = await (this.supabase as any)
      .from('notifications')
      .select('id')
      .eq('type', 'startup_studio');

    if (!notifIds || notifIds.length === 0) return;
    const ids = notifIds.map((n: { id: string }) => n.id);

    const { error } = await (this.supabase as any)
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('notification_id', ids)
      .is('read_at', null);

    if (error) {
      console.error('[startup-studio/notifications] markAllRead error:', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private static _mapRows(rows: any[]): StartupStudioNotification[] {
    return rows
      .filter((r) => r.notification?.type === 'startup_studio')
      .map((r) => ({
        id: r.notification.id,
        type: 'startup_studio' as const,
        title: r.notification.title,
        message: r.notification.message,
        metadata: r.notification.metadata ?? {},
        created_at: r.notification.created_at,
        user_notification_id: r.id,
        user_id: r.user_id,
        is_read: r.read_at !== null,
        read_at: r.read_at ?? null,
      }));
  }
}
