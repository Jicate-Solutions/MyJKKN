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
// BRIEFING CRUD OPERATIONS
// ============================================

/**
 * Create a new briefing
 */
export async function createBriefing(input: CreateBriefingInput): Promise<Briefing> {
  const { data, error } = await (supabase as any)
    .from('admission_briefings')
    .insert({
      institution_id: input.institution_id,
      briefing_date: input.briefing_date,
      title: input.title,
      summary: input.summary,
      content: input.content,
      status: 'published',
      created_by: input.created_by
    })
    .select()
    .single();

  if (error) {
    console.error('[admission/briefing-delivery] Error creating briefing:', error);
    throw new Error(`Failed to create briefing: ${error.message}`);
  }

  return data as Briefing;
}

/**
 * Get a briefing by ID
 */
export async function getBriefing(briefingId: string): Promise<Briefing | null> {
  const { data, error } = await (supabase as any)
    .from('admission_briefings')
    .select('*')
    .eq('id', briefingId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[admission/briefing-delivery] Error fetching briefing:', error);
    throw new Error(`Failed to fetch briefing: ${error.message}`);
  }

  return data as Briefing;
}

/**
 * Get the latest briefing for an institution
 */
export async function getLatestBriefing(institutionId: string): Promise<Briefing | null> {
  const { data, error } = await (supabase as any)
    .from('admission_briefings')
    .select('*')
    .eq('institution_id', institutionId)
    .eq('status', 'published')
    .order('briefing_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[admission/briefing-delivery] Error fetching latest briefing:', error);
    throw new Error(`Failed to fetch latest briefing: ${error.message}`);
  }

  return data as Briefing;
}

/**
 * Get today's briefing for an institution
 */
export async function getTodaysBriefing(institutionId: string): Promise<Briefing | null> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await (supabase as any)
    .from('admission_briefings')
    .select('*')
    .eq('institution_id', institutionId)
    .eq('briefing_date', today)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[admission/briefing-delivery] Error fetching today\'s briefing:', error);
    return null;
  }

  return (data?.[0] as Briefing) || null;
}

// ============================================
// NOTIFICATION DELIVERY
// ============================================

/**
 * Deliver a briefing to specified users
 */
export async function deliverBriefing(input: DeliverBriefingInput): Promise<BriefingNotification[]> {
  const briefing = await getBriefing(input.briefing_id);

  if (!briefing) {
    throw new Error('Briefing not found');
  }

  const notifications: BriefingNotification[] = [];

  for (const userId of input.user_ids) {
    // Check if notification already exists for this user and briefing
    const { data: existingRows } = await (supabase as any)
      .from('admission_briefing_notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('briefing_id', input.briefing_id)
      .limit(1);

    const existing = existingRows?.[0];

    if (existing) {
      // Skip if already delivered
      continue;
    }

    const { data, error } = await (supabase as any)
      .from('admission_briefing_notifications')
      .insert({
        user_id: userId,
        briefing_id: input.briefing_id,
        title: briefing.title,
        summary: briefing.summary,
        priority: input.priority || 'normal',
        is_read: false,
        metadata: {
          institution_id: briefing.institution_id,
          generated_at: briefing.created_at,
          key_metrics: briefing.content.key_metrics,
          highlights: briefing.content.highlights.map(h => h.title),
          action_items: briefing.content.action_items,
          insights_summary: briefing.content.executive_summary
        }
      })
      .select()
      .single();

    if (error) {
      console.error(`[admission/briefing-delivery] Error delivering to user ${userId}:`, error);
      continue;
    }

    notifications.push(data as BriefingNotification);
  }

  return notifications;
}

/**
 * Deliver briefing to all admission team members for an institution
 */
export async function deliverBriefingToTeam(
  briefingId: string,
  institutionId: string
): Promise<BriefingNotification[]> {
  // Get all users with admission module access for this institution
  const { data: teamMembers, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('institution_id', institutionId)
    .in('role', ['super_admin', 'institution_admin', 'admin', 'counselor', 'staff']);

  if (error) {
    console.error('[admission/briefing-delivery] Error fetching team members:', error);
    throw new Error(`Failed to fetch team members: ${error.message}`);
  }

  const userIds = teamMembers?.map(m => m.id) || [];

  return deliverBriefing({
    briefing_id: briefingId,
    user_ids: userIds,
    priority: 'normal'
  });
}

// ============================================
// NOTIFICATION RETRIEVAL
// ============================================

/**
 * Get briefing notifications for a user
 */
export async function getBriefingNotifications(
  userId: string,
  filters: Omit<BriefingNotificationFilters, 'user_id'> = {}
): Promise<BriefingNotification[]> {
  let query = (supabase as any)
    .from('admission_briefing_notifications')
    .select('*')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false });

  if (filters.is_read !== undefined) {
    query = query.eq('is_read', filters.is_read);
  }

  if (filters.from_date) {
    query = query.gte('created_at', filters.from_date);
  }

  if (filters.to_date) {
    query = query.lte('created_at', filters.to_date);
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
    throw new Error(`Failed to fetch notifications: ${error.message}`);
  }

  return (data as BriefingNotification[]) || [];
}

/**
 * Get unread briefing count for a user
 */
export async function getUnreadBriefingCount(userId: string): Promise<number> {
  const { count, error } = await (supabase as any)
    .from('admission_briefing_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .is('dismissed_at', null);

  if (error) {
    console.error('[admission/briefing-delivery] Error counting unread:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Get the latest unread briefing notification for a user
 */
export async function getLatestUnreadBriefing(userId: string): Promise<BriefingNotification | null> {
  const { data, error } = await (supabase as any)
    .from('admission_briefing_notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('is_read', false)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[admission/briefing-delivery] Error fetching latest unread:', error);
    return null;
  }

  return data as BriefingNotification;
}

// ============================================
// NOTIFICATION ACTIONS
// ============================================

/**
 * Mark a notification as read
 */
export async function markNotificationRead(notificationId: string): Promise<BriefingNotification> {
  const { data, error } = await (supabase as any)
    .from('admission_briefing_notifications')
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

  return data as BriefingNotification;
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('admission_briefing_notifications')
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
 * Dismiss a notification (hide from banner/popup)
 */
export async function dismissNotification(notificationId: string): Promise<BriefingNotification> {
  const { data, error } = await (supabase as any)
    .from('admission_briefing_notifications')
    .update({
      dismissed_at: new Date().toISOString()
    })
    .eq('id', notificationId)
    .select()
    .single();

  if (error) {
    console.error('[admission/briefing-delivery] Error dismissing notification:', error);
    throw new Error(`Failed to dismiss notification: ${error.message}`);
  }

  return data as BriefingNotification;
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
