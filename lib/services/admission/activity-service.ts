// lib/services/admission/activity-service.ts
// Admission Lead Activities Service - Enhanced timeline functionality
// v3 - Fixed column mapping to match actual DB schema
//
// DB table: admission_lead_activities
// Actual columns: id, lead_id, activity_type, subject, description, outcome, scheduled_at, completed_at, created_by, created_at
//
// Writers across the codebase that target this table:
//   * lib/services/telephony/telephony-service.ts — outbound logManualCall + inbound webhook
//   * lib/services/telephony/inbound-call-sync-service.ts — cron CDR sync (PR #840)
//   * counselor-daily-view-service.ts — daily-view aggregation reads/writes
//   * application-service.ts — stage_change activity write on application creation
// Keep them direction-specific. Each is a distinct event class, not redundancy.

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Types
export type ActivityType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'note'
  | 'sms'
  | 'whatsapp'
  | 'stage_change'
  | 'task'
  | 'checklist_marked'
  // Audit activities — written by service-layer hooks, not by user-driven UI.
  // Surface on the timeline so officers can see the lead's full provenance.
  | 'lead_created'
  | 'moved_to_counselor'
  | 'moved_to_account_verified'
  | 'enquiry_submitted'
  | 'student_section_filled';

export interface LeadActivity {
  id: string;
  lead_id: string;
  activity_type: ActivityType;
  subject: string | null;
  description: string | null;
  outcome: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  // Alias for backwards compat with components that use `title`
  title: string | null;
}

export interface StageHistoryEntry {
  id: string;
  lead_id: string;
  from_stage: string | null;
  to_stage: string;
  changed_by: string | null;
  created_at: string;
  // Virtual fields
  changed_by_name?: string;
}

export interface TimelineEntry {
  id: string;
  type: 'activity' | 'stage_change';
  timestamp: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  icon?: string;
  color?: string;
  /**
   * Author of the activity / stage change. Resolved via a single batched
   * profile lookup inside getEnhancedTimeline — undefined when the row's
   * created_by/changed_by is null (system actions) or when the user has
   * been deleted (orphan UUID). Display order: full_name → email → 'System'.
   */
  author?: {
    id: string;
    full_name?: string | null;
    email?: string | null;
  } | null;
}

export interface CreateActivityInput {
  lead_id: string;
  activity_type: ActivityType;
  title?: string;       // maps to DB column `subject`
  description?: string;
  outcome?: string;
  scheduled_at?: string;
}

export interface ActivityStats {
  totalActivities: number;
  callsCount: number;
  emailsCount: number;
  meetingsCount: number;
  notesCount: number;
  stageChanges: number;
}

export class ActivityService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  /**
   * Normalize a DB row to the LeadActivity interface.
   * DB columns: subject, created_by, outcome, scheduled_at, completed_at
   */
  private static normalizeActivity(row: any): LeadActivity {
    return {
      id: row.id,
      lead_id: row.lead_id,
      activity_type: row.activity_type,
      subject: row.subject || null,
      title: row.subject || null,  // alias for components using `title`
      description: row.description || null,
      outcome: row.outcome || null,
      scheduled_at: row.scheduled_at || null,
      completed_at: row.completed_at || null,
      created_by: row.created_by || null,
      created_at: row.created_at,
    };
  }

  // ============================================================================
  // ACTIVITY CRUD
  // ============================================================================

  /**
   * Get all activities for a lead
   */
  static async getActivities(leadId: string): Promise<LeadActivity[]> {
    const { data, error } = await this.supabase
      .from('admission_lead_activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admission/activities] Failed to fetch activities:', error);
      throw new Error('Failed to fetch activities');
    }

    return (data || []).map((row: any) => this.normalizeActivity(row));
  }

  /**
   * Create a new activity and bump last_activity_at on the lead — in ONE
   * round-trip via the create_lead_activity SECURITY DEFINER RPC. Replaces the
   * former 3 serial calls (auth.getUser + INSERT under RLS + a separate
   * admission_leads UPDATE through the heavy adm_leads_update RLS cascade). The
   * RPC captures auth.uid() server-side for created_by, re-checks authorization
   * (mirrors the activity-table RLS), and sets last_contact_at only for genuine
   * contact activity types.
   */
  static async createActivity(input: CreateActivityInput): Promise<LeadActivity> {
    const subject =
      input.title ||
      input.activity_type
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l: string) => l.toUpperCase());

    const { data, error } = await this.supabase
      .rpc('create_lead_activity', {
        p_lead_id: input.lead_id,
        p_activity_type: input.activity_type,
        p_subject: subject,
        p_description: input.description ?? null,
        p_outcome: input.outcome ?? null,
        p_scheduled_at: input.scheduled_at ?? null,
      })
      .single();

    if (error) {
      console.error('[admission/activities] Failed to create activity:', error);
      throw new Error('Failed to create activity');
    }

    return this.normalizeActivity(data);
  }

  /**
   * Update an activity
   */
  static async updateActivity(id: string, updates: Partial<CreateActivityInput>): Promise<LeadActivity> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.activity_type !== undefined) dbUpdates.activity_type = updates.activity_type;
    if (updates.title !== undefined) dbUpdates.subject = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.outcome !== undefined) dbUpdates.outcome = updates.outcome;
    if (updates.scheduled_at !== undefined) dbUpdates.scheduled_at = updates.scheduled_at;

    const { data, error } = await this.supabase
      .from('admission_lead_activities')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/activities] Failed to update activity:', error);
      throw new Error('Failed to update activity');
    }

    return this.normalizeActivity(data);
  }

  /**
   * Delete an activity
   */
  static async deleteActivity(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_lead_activities')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/activities] Failed to delete activity:', error);
      throw new Error('Failed to delete activity');
    }
  }

  // ============================================================================
  // STAGE HISTORY
  // ============================================================================

  /**
   * Get stage history for a lead
   */
  static async getStageHistory(leadId: string): Promise<StageHistoryEntry[]> {
    const { data, error } = await this.supabase
      .from('admission_lead_stage_history')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admission/activities] Failed to fetch stage history:', error);
      throw new Error('Failed to fetch stage history');
    }

    return data || [];
  }

  // ============================================================================
  // ENHANCED TIMELINE
  // ============================================================================

  /**
   * Map a LeadActivity to a TimelineEntry. Shared by getEnhancedTimeline and the
   * optimistic create in hooks/admission/use-activities.ts so an optimistically
   * inserted note renders with the exact same shape/icon/color as the server
   * version (and reconciles seamlessly on refetch).
   */
  static activityToTimelineEntry(
    activity: LeadActivity,
    author: TimelineEntry['author'] = null,
  ): TimelineEntry {
    return {
      id: activity.id,
      type: 'activity',
      timestamp: activity.created_at,
      title: activity.subject || this.getActivityTitle(activity.activity_type),
      description: activity.description,
      metadata: {
        activity_type: activity.activity_type,
        outcome: activity.outcome || null,
        scheduled_at: activity.scheduled_at || null,
      },
      icon: this.getActivityIcon(activity.activity_type),
      color: this.getActivityColor(activity.activity_type),
      author,
    };
  }

  /**
   * Get combined timeline (activities + stage changes)
   */
  static async getEnhancedTimeline(leadId: string): Promise<TimelineEntry[]> {
    // Fetch both activities and stage history in parallel
    const [activitiesResult, stageHistoryResult] = await Promise.allSettled([
      this.getActivities(leadId),
      this.getStageHistory(leadId),
    ]);

    // If both queries fail, throw an error instead of returning empty timeline
    if (activitiesResult.status === 'rejected' && stageHistoryResult.status === 'rejected') {
      console.error('[admission/activities] Both timeline queries failed:', {
        activitiesError: activitiesResult.reason,
        stageHistoryError: stageHistoryResult.reason,
      });
      throw new Error('Failed to fetch timeline data');
    }

    // Use graceful degradation if only one fails
    const activities = activitiesResult.status === 'fulfilled' ? activitiesResult.value : [];
    const stageHistory = stageHistoryResult.status === 'fulfilled' ? stageHistoryResult.value : [];

    // Batched author lookup. Collect every unique user UUID across both
    // streams (activities.created_by + stage_history.changed_by), fetch their
    // profiles in ONE query, then attach `author` to each entry below. Avoids
    // PostgREST embed (which would require an FK constraint on created_by
    // that doesn't exist — see route.ts comment for the audit-table soft-FK
    // rationale).
    const userIds = Array.from(
      new Set([
        ...activities.map((a) => a.created_by).filter((id): id is string => !!id),
        ...stageHistory.map((s) => s.changed_by).filter((id): id is string => !!id),
      ]),
    );

    let profileById: Record<string, { id: string; full_name: string | null; email: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await this.supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      profileById = Object.fromEntries(
        ((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
          (p) => [p.id, p],
        ),
      );
    }

    const authorFor = (uid: string | null) =>
      uid ? profileById[uid] ?? { id: uid, full_name: null, email: null } : null;

    // Transform activities to timeline entries via the shared mapper (also used
    // by the optimistic insert in use-activities.ts so shapes stay identical).
    const activityEntries: TimelineEntry[] = activities.map((activity) =>
      this.activityToTimelineEntry(activity, authorFor(activity.created_by)),
    );

    // Transform stage changes to timeline entries
    const stageEntries: TimelineEntry[] = stageHistory.map((entry) => ({
      id: entry.id,
      type: 'stage_change' as const,
      timestamp: entry.created_at,
      title: 'Stage Changed',
      description: entry.from_stage
        ? `${this.formatStage(entry.from_stage)} → ${this.formatStage(entry.to_stage)}`
        : `Moved to ${this.formatStage(entry.to_stage)}`,
      metadata: {
        from_stage: entry.from_stage,
        to_stage: entry.to_stage,
        changed_by: entry.changed_by,
      },
      icon: 'git-branch',
      color: 'indigo',
      author: authorFor(entry.changed_by),
    }));

    // Combine and sort by timestamp (newest first)
    const timeline = [...activityEntries, ...stageEntries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return timeline;
  }

  // ============================================================================
  // STATS & ANALYTICS
  // ============================================================================

  /**
   * Get activity stats for a lead
   */
  static async getActivityStats(leadId: string): Promise<ActivityStats> {
    const [activities, stageHistory] = await Promise.all([
      this.getActivities(leadId),
      this.getStageHistory(leadId),
    ]);

    return {
      totalActivities: activities.length,
      callsCount: activities.filter(a => a.activity_type === 'call').length,
      emailsCount: activities.filter(a => a.activity_type === 'email').length,
      meetingsCount: activities.filter(a => a.activity_type === 'meeting').length,
      notesCount: activities.filter(a => a.activity_type === 'note').length,
      stageChanges: stageHistory.length,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private static getActivityTitle(type: ActivityType): string {
    const titles: Record<ActivityType, string> = {
      call: 'Phone Call',
      email: 'Email Sent',
      meeting: 'Meeting',
      note: 'Note Added',
      sms: 'SMS Sent',
      whatsapp: 'WhatsApp Message',
      stage_change: 'Stage Changed',
      task: 'Task',
      checklist_marked: 'Checklist Updated',
    };
    return titles[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private static getActivityIcon(type: ActivityType): string {
    const icons: Record<ActivityType, string> = {
      call: 'phone',
      email: 'mail',
      meeting: 'calendar',
      note: 'file-text',
      sms: 'message-square',
      whatsapp: 'message-circle',
      stage_change: 'git-branch',
      task: 'check-circle',
      checklist_marked: 'check-circle',
      lead_created: 'user-plus',
      moved_to_counselor: 'user-plus',
      moved_to_account_verified: 'check-circle',
      enquiry_submitted: 'file-text',
      student_section_filled: 'file-text',
    };
    return icons[type] || 'activity';
  }

  private static getActivityColor(type: ActivityType): string {
    const colors: Record<ActivityType, string> = {
      call: 'green',
      email: 'blue',
      meeting: 'purple',
      note: 'gray',
      sms: 'orange',
      whatsapp: 'green',
      stage_change: 'indigo',
      task: 'emerald',
      checklist_marked: 'emerald',
      lead_created: 'blue',
      moved_to_counselor: 'emerald',
      moved_to_account_verified: 'orange',
      enquiry_submitted: 'purple',
      student_section_filled: 'emerald',
    };
    return colors[type] || 'gray';
  }

  private static formatStage(stage: string): string {
    return stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}
