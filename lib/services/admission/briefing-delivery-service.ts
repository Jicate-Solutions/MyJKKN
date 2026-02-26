/**
 * Briefing Delivery Service
 *
 * Manages the delivery of AI-generated briefings to admission team users.
 * Handles creating briefing notifications, tracking read status, and
 * retrieving briefings for display.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';

const supabase = createClientSupabaseClient();

// ============================================
// TYPES
// ============================================

export interface BriefingNotification {
  id: string;
  user_id: string;
  briefing_id: string;
  title: string;
  summary: string;
  priority: 'high' | 'normal' | 'low';
  is_read: boolean;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: BriefingMetadata | null;
}

export interface BriefingMetadata {
  institution_id?: string;
  generated_at?: string;
  key_metrics?: {
    total_leads?: number;
    new_leads?: number;
    hot_leads?: number;
    followups_today?: number;
    conversion_rate?: number;
  };
  highlights?: string[];
  action_items?: ActionItem[];
  insights_summary?: string;
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  type: 'followup' | 'review' | 'action' | 'alert';
  link?: string;
  completed?: boolean;
}

export interface Briefing {
  id: string;
  institution_id: string;
  briefing_date: string;
  title: string;
  summary: string;
  content: BriefingContent;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface BriefingContent {
  executive_summary: string;
  key_metrics: {
    total_leads: number;
    new_leads: number;
    hot_leads: number;
    followups_today: number;
    overdue_followups: number;
    conversion_rate: number;
    leads_by_stage: Record<string, number>;
  };
  highlights: {
    title: string;
    description: string;
    type: 'success' | 'warning' | 'info' | 'alert';
  }[];
  action_items: ActionItem[];
  predictions: {
    metric: string;
    prediction: string;
    confidence: 'high' | 'medium' | 'low';
  }[];
  recommendations: {
    category: string;
    recommendation: string;
    impact: string;
  }[];
}

export interface CreateBriefingInput {
  institution_id: string;
  briefing_date: string;
  title: string;
  summary: string;
  content: BriefingContent;
  created_by?: string;
}

export interface DeliverBriefingInput {
  briefing_id: string;
  user_ids: string[];
  priority?: 'high' | 'normal' | 'low';
}

export interface BriefingNotificationFilters {
  user_id?: string;
  is_read?: boolean;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

// ============================================
// ROW MAPPER HELPERS
// Maps admission_daily_briefings rows → service types
// ============================================

// The DB table admission_daily_briefings has: id, institution_id, user_id,
// briefing_date, user_tier, content (jsonb), is_read, read_at, role, created_at, updated_at
// There is no separate admission_briefings / admission_briefing_notifications table.

function mapRowToBriefing(row: any): Briefing {
  return {
    id: row.id,
    institution_id: row.institution_id,
    briefing_date: row.briefing_date,
    title: 'Daily Briefing',
    summary: (row.content as BriefingContent)?.executive_summary ?? '',
    content: row.content as BriefingContent,
    status: 'published',
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: null,
  };
}

function mapRowToNotification(row: any): BriefingNotification {
  const content = row.content as BriefingContent | null;
  return {
    id: row.id,
    user_id: row.user_id,
    briefing_id: row.id, // same record — no separate briefings table
    title: 'Daily Briefing',
    summary: content?.executive_summary ?? '',
    priority: 'normal',
    is_read: row.is_read,
    read_at: row.read_at ?? null,
    dismissed_at: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: content
      ? {
          institution_id: row.institution_id,
          key_metrics: content.key_metrics,
          highlights: content.highlights?.map((h) => h.title) ?? [],
          action_items: content.action_items ?? [],
          insights_summary: content.executive_summary,
        }
      : null,
  };
}

// ============================================
// BRIEFING CRUD OPERATIONS
// ============================================

/**
 * Create a new briefing (writes to admission_daily_briefings)
 */
export async function createBriefing(input: CreateBriefingInput): Promise<Briefing> {
  const { data, error } = await (supabase as any)
    .from('admission_daily_briefings')
    .insert({
      institution_id: input.institution_id,
      briefing_date: input.briefing_date,
      content: input.content,
      is_read: false,
    })
    .select()
    .single();

  if (error) {
    console.error('[admission/briefing-delivery] Error creating briefing:', error);
    throw new Error(`Failed to create briefing: ${error.message}`);
  }

  return mapRowToBriefing(data);
}

/**
 * Get a briefing by ID (reads from admission_daily_briefings)
 */
export async function getBriefing(briefingId: string): Promise<Briefing | null> {
  const { data, error } = await (supabase as any)
    .from('admission_daily_briefings')
    .select('*')
    .eq('id', briefingId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[admission/briefing-delivery] Error fetching briefing:', error);
    return null;
  }

  return mapRowToBriefing(data);
}

/**
 * Get the latest briefing for an institution
 */
export async function getLatestBriefing(institutionId: string | undefined): Promise<Briefing | null> {
  let query = (supabase as any)
    .from('admission_daily_briefings')
    .select('*')
    .order('briefing_date', { ascending: false })
    .limit(1);
  if (institutionId) query = query.eq('institution_id', institutionId);
  const { data, error } = await query.single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[admission/briefing-delivery] Error fetching latest briefing:', error);
    return null;
  }

  return mapRowToBriefing(data);
}

/**
 * Get today's briefing for an institution
 */
export async function getTodaysBriefing(institutionId: string | undefined): Promise<Briefing | null> {
  const today = new Date().toISOString().split('T')[0];

  let query = (supabase as any)
    .from('admission_daily_briefings')
    .select('*')
    .eq('briefing_date', today)
    .order('created_at', { ascending: false })
    .limit(1);
  if (institutionId) query = query.eq('institution_id', institutionId);
  const { data, error } = await query;

  if (error) {
    console.error('[admission/briefing-delivery] Error fetching today\'s briefing:', error);
    return null;
  }

  return data?.[0] ? mapRowToBriefing(data[0]) : null;
}

// ============================================
// NOTIFICATION DELIVERY
// ============================================

/**
 * Deliver a briefing to specified users.
 * With admission_daily_briefings, records are created server-side per user.
 * This function is a no-op on the client — delivery happens via backend/cron.
 */
export async function deliverBriefing(_input: DeliverBriefingInput): Promise<BriefingNotification[]> {
  // Delivery is handled server-side by inserting into admission_daily_briefings.
  // The client does not insert into this table directly.
  return [];
}

/**
 * Deliver briefing to all admission team members for an institution.
 * Handled server-side — no-op on the client.
 */
export async function deliverBriefingToTeam(
  _briefingId: string,
  _institutionId: string
): Promise<BriefingNotification[]> {
  return [];
}

// ============================================
// NOTIFICATION RETRIEVAL
// ============================================

/**
 * Get briefing notifications for a user (reads from admission_daily_briefings)
 */
export async function getBriefingNotifications(
  userId: string,
  filters: Omit<BriefingNotificationFilters, 'user_id'> = {}
): Promise<BriefingNotification[]> {
  let query = (supabase as any)
    .from('admission_daily_briefings')
    .select('*')
    .eq('user_id', userId)
    .order('briefing_date', { ascending: false });

  if (filters.is_read !== undefined) {
    query = query.eq('is_read', filters.is_read);
  }

  if (filters.from_date) {
    query = query.gte('briefing_date', filters.from_date);
  }

  if (filters.to_date) {
    query = query.lte('briefing_date', filters.to_date);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[admission/briefing-delivery] Error fetching notifications:', error);
    return [];
  }

  return (data ?? []).map(mapRowToNotification);
}

/**
 * Get unread briefing count for a user (reads from admission_daily_briefings)
 */
export async function getUnreadBriefingCount(userId: string): Promise<number> {
  const { count, error } = await (supabase as any)
    .from('admission_daily_briefings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error('[admission/briefing-delivery] Error counting unread:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Get the latest unread briefing notification for a user (reads from admission_daily_briefings)
 */
export async function getLatestUnreadBriefing(userId: string): Promise<BriefingNotification | null> {
  const { data, error } = await (supabase as any)
    .from('admission_daily_briefings')
    .select('*')
    .eq('user_id', userId)
    .eq('is_read', false)
    .order('briefing_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[admission/briefing-delivery] Error fetching latest unread:', error);
    return null;
  }

  return mapRowToNotification(data);
}

// ============================================
// NOTIFICATION ACTIONS
// ============================================

/**
 * Mark a notification as read (updates admission_daily_briefings)
 */
export async function markNotificationRead(notificationId: string): Promise<BriefingNotification> {
  const { data, error } = await (supabase as any)
    .from('admission_daily_briefings')
    .update({
      is_read: true,
      read_at: new Date().toISOString()
    })
    .eq('id', notificationId)
    .select()
    .single();

  if (error) {
    console.error('[admission/briefing-delivery] Error marking as read:', error);
    throw new Error(`Failed to mark notification as read: ${error.message}`);
  }

  return mapRowToNotification(data);
}

/**
 * Mark all notifications as read for a user (updates admission_daily_briefings)
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('admission_daily_briefings')
    .update({
      is_read: true,
      read_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error('[admission/briefing-delivery] Error marking all as read:', error);
    throw new Error(`Failed to mark all notifications as read: ${error.message}`);
  }
}

/**
 * Dismiss a notification.
 * admission_daily_briefings has no dismissed_at column — mark as read instead.
 */
export async function dismissNotification(notificationId: string): Promise<BriefingNotification> {
  return markNotificationRead(notificationId);
}

// ============================================
// BRIEFING SERVICE EXPORT
// ============================================

export const BriefingDeliveryService = {
  // Briefing CRUD
  createBriefing,
  getBriefing,
  getLatestBriefing,
  getTodaysBriefing,

  // Delivery
  deliverBriefing,
  deliverBriefingToTeam,

  // Notifications
  getBriefingNotifications,
  getUnreadBriefingCount,
  getLatestUnreadBriefing,

  // Actions
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification
};
