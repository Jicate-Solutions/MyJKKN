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
  user_id: string;
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
      user_id: input.user_id,
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
 * Get the latest briefing.
 *
 * Briefings are per-user (each counselor gets a personalised row on demand).
 * When a `userId` is provided, we scope the read to that user so Counselor B
 * does not see Counselor A's briefing (BUG-003146 — per-user data leak).
 *
 * Back-compat: when `userId` is omitted, the query falls back to the
 * institution-wide "latest" row. This preserves the super-admin preview
 * behaviour that mirrors the existing `institutionId === undefined` pattern
 * used elsewhere in this service.
 */
export async function getLatestBriefing(
  institutionId: string | undefined,
  userId?: string
): Promise<Briefing | null> {
  let query = (supabase as any)
    .from('admission_daily_briefings')
    .select('*')
    .order('briefing_date', { ascending: false })
    .limit(1);
  if (institutionId) query = query.eq('institution_id', institutionId);
  if (userId) query = query.eq('user_id', userId);
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
// BRIEFING GENERATION
// ============================================

/**
 * Generate today's briefing for an institution, or return existing one.
 * Queries real admission data and formats it as BriefingContent for the page.
 */
export async function generateDailyBriefing(
  userId: string,
  institutionId: string
): Promise<Briefing> {
  const today = new Date().toISOString().split('T')[0];

  // Return today's existing briefing if already generated
  const existing = await getTodaysBriefing(institutionId);
  if (existing) return existing;

  // ── Fetch lead data ──────────────────────────────────────────────────────
  const todayStart = `${today}T00:00:00`;
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: leads } = await (supabase as any)
    .from('admission_leads')
    .select('id, full_name, funnel_stage, created_at, is_hot_lead, score, last_contact_at')
    .eq('institution_id', institutionId);

  const allLeads: any[] = leads || [];

  // ── Compute key metrics ──────────────────────────────────────────────────
  const total_leads = allLeads.length;
  const new_leads = allLeads.filter((l) => l.created_at >= todayStart).length;
  const hot_leads = allLeads.filter((l) => l.is_hot_lead).length;
  const enrolled_count = allLeads.filter((l) => l.funnel_stage === 'enrolled').length;
  const conversion_rate =
    total_leads > 0 ? Math.round((enrolled_count / total_leads) * 1000) / 10 : 0;

  const overdue_followups = allLeads.filter((l) => {
    if (l.funnel_stage === 'enrolled' || l.funnel_stage === 'lost') return false;
    if (!l.last_contact_at) return true;
    return l.last_contact_at < threeDaysAgo;
  }).length;

  const leads_by_stage: Record<string, number> = {};
  allLeads.forEach((l) => {
    leads_by_stage[l.funnel_stage] = (leads_by_stage[l.funnel_stage] || 0) + 1;
  });

  // ── Build action items from hot leads + overdue ──────────────────────────
  const topHot = allLeads
    .filter((l) => l.is_hot_lead && l.funnel_stage !== 'enrolled' && l.funnel_stage !== 'lost')
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3);

  const action_items: ActionItem[] = [
    ...topHot.map((l) => ({
      id: `hot-${l.id}`,
      title: `Follow up with ${l.full_name}`,
      description: 'Hot lead — high conversion potential',
      priority: 'high' as const,
      type: 'followup' as const,
      link: `/admission/leads/${l.id}`,
    })),
    ...(overdue_followups > 0
      ? [
          {
            id: 'overdue-batch',
            title: `${overdue_followups} overdue follow-up${overdue_followups > 1 ? 's' : ''}`,
            description: 'Leads not contacted in 3+ days — review and re-engage',
            priority: 'medium' as const,
            type: 'alert' as const,
            link: '/admission/leads',
          },
        ]
      : []),
  ];

  // ── Build highlights ─────────────────────────────────────────────────────
  const highlights: BriefingContent['highlights'] = [];
  if (new_leads > 0) {
    highlights.push({
      title: `${new_leads} new lead${new_leads > 1 ? 's' : ''} today`,
      description: 'Fresh prospects added to your pipeline',
      type: 'success',
    });
  }
  if (hot_leads > 0) {
    highlights.push({
      title: `${hot_leads} hot lead${hot_leads > 1 ? 's' : ''} in pipeline`,
      description: 'High-engagement prospects ready for action',
      type: 'info',
    });
  }
  if (overdue_followups > 0) {
    highlights.push({
      title: `${overdue_followups} overdue follow-up${overdue_followups > 1 ? 's' : ''}`,
      description: 'Leads not contacted in 3+ days',
      type: 'warning',
    });
  }

  // ── Executive summary ────────────────────────────────────────────────────
  const parts: string[] = [];
  if (new_leads > 0) parts.push(`${new_leads} new lead${new_leads > 1 ? 's' : ''}`);
  if (hot_leads > 0) parts.push(`${hot_leads} hot lead${hot_leads > 1 ? 's' : ''}`);
  if (overdue_followups > 0)
    parts.push(`${overdue_followups} overdue follow-up${overdue_followups > 1 ? 's' : ''}`);

  const executive_summary =
    parts.length > 0
      ? `Good morning! Today: ${parts.join(', ')}. Overall conversion rate: ${conversion_rate}%.`
      : `Good morning! Your pipeline is steady today with ${total_leads} total leads. Conversion rate: ${conversion_rate}%.`;

  const content: BriefingContent = {
    executive_summary,
    key_metrics: {
      total_leads,
      new_leads,
      hot_leads,
      followups_today: overdue_followups,
      overdue_followups,
      conversion_rate,
      leads_by_stage,
    },
    highlights,
    action_items,
    predictions: [],
    recommendations: [],
  };

  return createBriefing({
    institution_id: institutionId,
    user_id: userId,
    briefing_date: today,
    title: 'Daily Briefing',
    summary: executive_summary,
    content,
  });
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

  // Generation
  generateDailyBriefing,

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
