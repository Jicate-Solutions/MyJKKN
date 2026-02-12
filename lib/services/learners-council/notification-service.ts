// lib/services/learners-council/notification-service.ts
// LC Notifications - Service Layer
// NOTE: lc_notifications table has Realtime enabled — future Realtime subscription can be added

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  LCNotification,
  LCNotificationPreference,
  NotificationType
} from '@/types/learners-council';

export class LCNotificationService {
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // NOTIFICATION CRUD
  // ============================================================================

  /**
   * Get notifications for a user with optional filters
   */
  static async getNotifications(userId: string, filters?: {
    type?: string;
    is_read?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<LCNotification[]> {
    let query = (this.supabase as any)
      .from('lc_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters?.type) {
      query = query.eq('type', filters.type);
    }
    if (filters?.is_read !== undefined) {
      query = query.eq('is_read', filters.is_read);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[lc/notifications] Error fetching notifications:', error);
      throw new Error(`Failed to fetch notifications: ${error.message}`);
    }

    return (data || []) as LCNotification[];
  }

  /**
   * Get a single notification by ID
   */
  static async getNotificationById(id: string): Promise<LCNotification> {
    const { data, error } = await (this.supabase as any)
      .from('lc_notifications')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[lc/notifications] Error fetching notification:', error);
      if (error.code === 'PGRST116') {
        throw new Error('Notification not found');
      }
      throw new Error(`Failed to fetch notification: ${error.message}`);
    }

    return data as LCNotification;
  }

  /**
   * Mark a single notification as read
   */
  static async markNotificationRead(id: string): Promise<LCNotification> {
    const { data, error } = await (this.supabase as any)
      .from('lc_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[lc/notifications] Error marking notification read:', error);
      throw new Error(`Failed to mark notification read: ${error.message}`);
    }

    return data as LCNotification;
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllNotificationsRead(userId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('lc_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      console.error('[lc/notifications] Error marking all notifications read:', error);
      throw new Error(`Failed to mark all notifications read: ${error.message}`);
    }
  }

  /**
   * Get unread notification count for a user
   */
  static async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await (this.supabase as any)
      .from('lc_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      console.error('[lc/notifications] Error fetching unread count:', error);
      throw new Error(`Failed to fetch unread count: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Delete a notification
   */
  static async deleteNotification(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('lc_notifications')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[lc/notifications] Error deleting notification:', error);
      throw new Error(`Failed to delete notification: ${error.message}`);
    }
  }

  // ============================================================================
  // NOTIFICATION CREATION (Internal — called by other services)
  // ============================================================================

  /**
   * Create a single notification
   */
  static async createNotification(data: {
    user_id: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    reference_id?: string;
    reference_type?: string;
    metadata?: Record<string, any>;
  }): Promise<LCNotification> {
    const { data: notification, error } = await (this.supabase as any)
      .from('lc_notifications')
      .insert({
        user_id: data.user_id,
        type: data.type,
        title: data.title,
        message: data.message,
        link: data.link || null,
        reference_id: data.reference_id || null,
        reference_type: data.reference_type || null,
        is_read: false
      })
      .select()
      .single();

    if (error) {
      console.error('[lc/notifications] Error creating notification:', error);
      throw new Error(`Failed to create notification: ${error.message}`);
    }

    return notification as LCNotification;
  }

  /**
   * Bulk create notifications (e.g. notify all LC members about an announcement)
   */
  static async bulkCreateNotifications(notifications: Array<{
    user_id: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    reference_id?: string;
    reference_type?: string;
  }>): Promise<LCNotification[]> {
    const rows = notifications.map((n) => ({
      user_id: n.user_id,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link || null,
      reference_id: n.reference_id || null,
      reference_type: n.reference_type || null,
      is_read: false
    }));

    const { data, error } = await (this.supabase as any)
      .from('lc_notifications')
      .insert(rows)
      .select();

    if (error) {
      console.error('[lc/notifications] Error bulk creating notifications:', error);
      throw new Error(`Failed to bulk create notifications: ${error.message}`);
    }

    return (data || []) as LCNotification[];
  }

  // ============================================================================
  // NOTIFICATION PREFERENCES
  // ============================================================================

  /**
   * Get all notification preferences for a user
   */
  static async getNotificationPreferences(userId: string): Promise<LCNotificationPreference[]> {
    const { data, error } = await (this.supabase as any)
      .from('lc_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .order('notification_type', { ascending: true });

    if (error) {
      console.error('[lc/notifications] Error fetching preferences:', error);
      throw new Error(`Failed to fetch notification preferences: ${error.message}`);
    }

    return (data || []) as LCNotificationPreference[];
  }

  /**
   * Update notification preferences for a user.
   * Uses upsert so preferences are created if they don't exist yet.
   */
  static async updateNotificationPreferences(
    userId: string,
    preferences: Partial<{
      announcements: boolean;
      events: boolean;
      approvals: boolean;
      chat: boolean;
      mentions: boolean;
      issues: boolean;
    }>
  ): Promise<LCNotificationPreference[]> {
    // Map friendly keys to notification_type values
    const typeMap: Record<string, NotificationType> = {
      announcements: 'announcement',
      events: 'event',
      approvals: 'od_approval',
      chat: 'chat',
      mentions: 'forum',
      issues: 'issue'
    };

    const upserts: Array<{
      user_id: string;
      notification_type: NotificationType;
      channel_in_app: boolean;
      updated_at: string;
    }> = [];

    for (const [key, enabled] of Object.entries(preferences)) {
      const notificationType = typeMap[key];
      if (notificationType && enabled !== undefined) {
        upserts.push({
          user_id: userId,
          notification_type: notificationType,
          channel_in_app: enabled,
          updated_at: new Date().toISOString()
        });
      }
    }

    if (upserts.length === 0) {
      return this.getNotificationPreferences(userId);
    }

    const { data, error } = await (this.supabase as any)
      .from('lc_notification_preferences')
      .upsert(upserts, {
        onConflict: 'user_id,notification_type'
      })
      .select();

    if (error) {
      console.error('[lc/notifications] Error updating preferences:', error);
      throw new Error(`Failed to update notification preferences: ${error.message}`);
    }

    // Return full preferences list after update
    return this.getNotificationPreferences(userId);
  }
}
