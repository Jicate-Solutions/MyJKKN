// lib/services/admission/activity-service.ts
// Admission Lead Activities Service - Enhanced timeline functionality
// v3 - Fixed column mapping to match actual DB schema
//
// DB table: admission_lead_activities
// Actual columns: id, lead_id, activity_type, subject, description, outcome, scheduled_at, completed_at, created_by, created_at

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Types
export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'sms' | 'whatsapp' | 'stage_change' | 'task';

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
   * Create a new activity and update last_activity_at on the lead
   */
  static async createActivity(input: CreateActivityInput): Promise<LeadActivity> {
    // Get current user
    const { data: { user } } = await this.supabase.auth.getUser();

    const { data, error } = await this.supabase
      .from('admission_lead_activities')
      .insert({
        lead_id: input.lead_id,
        activity_type: input.activity_type,
        subject: input.title || input.activity_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        description: input.description || null,
        outcome: input.outcome || null,
        scheduled_at: input.scheduled_at || null,
        created_by: user?.id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/activities] Failed to create activity:', error);
      throw new Error('Failed to create activity');
    }

    // Update last_activity_at on the lead (best-effort, don't throw if this fails)
    const now = new Date().toISOString();
    const contactTypes = new Set(['call', 'email', 'meeting', 'sms', 'whatsapp']);
    const leadUpdate: Record<string, string> = {
      last_activity_at: now,
      updated_at: now,
    };
    // Only set last_contact_at for actual contact activities, not notes/tasks/stage_changes
    if (contactTypes.has(input.activity_type)) {
      leadUpdate.last_contact_at = now;
    }
    const { error: leadError } = await this.supabase
      .from('admission_leads')
      .update(leadUpdate)
      .eq('id', input.lead_id);

    if (leadError) {
      console.warn('[admission/activities] Could not update last_activity_at on lead:', leadError.message);
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

    // Transform activities to timeline entries.
    // Use stored title first (e.g. 'Follow-up Scheduled'), fall back to computed type label.
    const activityEntries: TimelineEntry[] = activities.map((activity) => ({
      id: activity.id,
      type: 'activity' as const,
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
    }));

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
    };
    return colors[type] || 'gray';
  }

  private static formatStage(stage: string): string {
    return stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}
