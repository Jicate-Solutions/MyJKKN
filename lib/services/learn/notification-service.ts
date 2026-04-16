// lib/services/learn/notification-service.ts
// PDE Learn — in-app notification CRUD, following the static-class pattern from
// lib/services/faculty-innovation/notification-service.ts.
//
// Table assumed: learn_pde_notifications
// Columns (minimum):
//   id uuid PK, user_id uuid, event_type text, quest_id uuid?, capability_id uuid?,
//   badge_id uuid?, cohort_id uuid?, title text, body text?, channels text[],
//   read_at timestamptz?, created_at timestamptz
//
// NOTE: If learn_pde_notifications does not yet exist on production, calls will
// return empty arrays / throw — this service is the integration contract.
// A validator should confirm table existence before live deploy.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LearnEventType, LearnNotification } from '@/types/learn';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = (): any => createClientSupabaseClient();

const TABLE = 'learn_pde_notifications';

export class LearnNotificationService {
  // --------------------------------------------------------------------------
  // CREATE
  // --------------------------------------------------------------------------

  /**
   * Create a single in-app notification for a user.
   * Called from server actions after quest unlock, badge award, etc.
   */
  static async create(params: {
    user_id: string;
    event_type: LearnEventType;
    title: string;
    body?: string;
    quest_id?: string;
    capability_id?: string;
    badge_id?: string;
    cohort_id?: string;
  }): Promise<LearnNotification> {
    const row = {
      user_id: params.user_id,
      event_type: params.event_type,
      title: params.title,
      body: params.body ?? null,
      quest_id: params.quest_id ?? null,
      capability_id: params.capability_id ?? null,
      badge_id: params.badge_id ?? null,
      cohort_id: params.cohort_id ?? null,
      channels: ['in_app'],
    };

    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert(row)
      .select('*')
      .single();

    if (error) throw error;
    return data as LearnNotification;
  }

  /**
   * Create notifications for multiple users at once.
   * Used for cohort_milestone — all members receive the same message.
   */
  static async createBulk(
    notifications: Array<{
      user_id: string;
      event_type: LearnEventType;
      title: string;
      body?: string;
      quest_id?: string;
      capability_id?: string;
      badge_id?: string;
      cohort_id?: string;
    }>
  ): Promise<void> {
    if (notifications.length === 0) return;

    const rows = notifications.map((n) => ({
      user_id: n.user_id,
      event_type: n.event_type,
      title: n.title,
      body: n.body ?? null,
      quest_id: n.quest_id ?? null,
      capability_id: n.capability_id ?? null,
      badge_id: n.badge_id ?? null,
      cohort_id: n.cohort_id ?? null,
      channels: ['in_app'],
    }));

    const { error } = await getSupabase().from(TABLE).insert(rows);

    if (error) {
      console.error('[learn/notification-service] Bulk insert failed:', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // READ
  // --------------------------------------------------------------------------

  /**
   * Get unread notifications for the authenticated user.
   * Used by the bell icon badge in the Learn shell.
   */
  static async getUnread(limit = 20): Promise<LearnNotification[]> {
    const supabase = getSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return [];

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data as LearnNotification[]) ?? [];
  }

  /**
   * Get all notifications (read + unread) for the authenticated user.
   */
  static async getAll(limit = 50): Promise<LearnNotification[]> {
    const supabase = getSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return [];

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data as LearnNotification[]) ?? [];
  }

  /**
   * Get unread count for the bell-icon badge.
   */
  static async getUnreadCount(): Promise<number> {
    const supabase = getSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return 0;

    const { count, error } = await supabase
      .from(TABLE)
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
   * Mark a single notification as read by id.
   */
  static async markAsRead(id: string): Promise<void> {
    if (!id) throw new Error('Notification id required');

    const { error } = await getSupabase()
      .from(TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Mark all unread notifications as read for the current user.
   */
  static async markAllRead(): Promise<void> {
    const supabase = getSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    const { error } = await supabase
      .from(TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) throw error;
  }
}
