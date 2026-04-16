// lib/services/faculty-innovation/notification-service.ts
// Create + mark-read for faculty_innovation_notifications.
// v1: channels=['in_app'] only. Channel-agnostic table for future expansion.
// Follows the same static-class pattern as faculty-initiative-service.ts.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  FacultyInnovationEventType,
  FacultyInnovationNotification,
} from '@/types/faculty-innovation';

export class FacultyInnovationNotificationService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // CREATE
  // --------------------------------------------------------------------------

  /**
   * Create an in-app notification for a user.
   * Called by approval actions, collab requests, escalation checks, etc.
   */
  static async create(params: {
    user_id: string;
    initiative_id?: string;
    event_type: FacultyInnovationEventType;
    title: string;
    body?: string;
  }): Promise<FacultyInnovationNotification> {
    const insert = {
      user_id: params.user_id,
      initiative_id: params.initiative_id ?? null,
      event_type: params.event_type,
      title: params.title,
      body: params.body ?? null,
      channels: ['in_app'],
    };

    const { data, error } = await (this.supabase as any)
      .from('faculty_innovation_notifications')
      .insert(insert)
      .select('*')
      .single();

    if (error) throw error;
    return data as FacultyInnovationNotification;
  }

  /**
   * Create notifications for multiple users at once (e.g., CC routing).
   */
  static async createBulk(
    notifications: Array<{
      user_id: string;
      initiative_id?: string;
      event_type: FacultyInnovationEventType;
      title: string;
      body?: string;
    }>
  ): Promise<void> {
    if (notifications.length === 0) return;

    const rows = notifications.map((n) => ({
      user_id: n.user_id,
      initiative_id: n.initiative_id ?? null,
      event_type: n.event_type,
      title: n.title,
      body: n.body ?? null,
      channels: ['in_app'],
    }));

    const { error } = await (this.supabase as any)
      .from('faculty_innovation_notifications')
      .insert(rows);

    if (error) {
      console.error('[faculty-innovation/notifications] Bulk insert failed:', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // READ
  // --------------------------------------------------------------------------

  /**
   * Get unread notifications for the current user.
   */
  static async getUnread(limit = 20): Promise<FacultyInnovationNotification[]> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return [];

    const { data, error } = await (this.supabase as any)
      .from('faculty_innovation_notifications')
      .select('*')
      .eq('user_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data as FacultyInnovationNotification[]) ?? [];
  }

  /**
   * Get all notifications (read + unread) for the current user.
   */
  static async getAll(limit = 50): Promise<FacultyInnovationNotification[]> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return [];

    const { data, error } = await (this.supabase as any)
      .from('faculty_innovation_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data as FacultyInnovationNotification[]) ?? [];
  }

  /**
   * Get unread count (for bell icon badge).
   */
  static async getUnreadCount(): Promise<number> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return 0;

    const { count, error } = await (this.supabase as any)
      .from('faculty_innovation_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) throw error;
    return count ?? 0;
  }

  // --------------------------------------------------------------------------
  // MARK READ
  // --------------------------------------------------------------------------

  /**
   * Mark a single notification as read.
   */
  static async markRead(id: string): Promise<void> {
    if (!id) throw new Error('Notification id required');

    const { error } = await (this.supabase as any)
      .from('faculty_innovation_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Mark all unread notifications as read for the current user.
   */
  static async markAllRead(): Promise<void> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    const { error } = await (this.supabase as any)
      .from('faculty_innovation_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) throw error;
  }
}
