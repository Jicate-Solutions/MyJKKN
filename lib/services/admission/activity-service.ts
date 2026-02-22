// lib/services/admission/activity-service.ts
// Admission Lead Activities Service - Enhanced timeline functionality
// v2 - Fixed column mapping: title (not subject), performed_by (not created_by)
//
// DB table: admission_lead_activities
// Actual columns: id, lead_id, institution_id, activity_type, title, description, metadata, performed_by, created_at

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Types
export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'sms' | 'whatsapp' | 'stage_change' | 'task';

export interface LeadActivity {
  id: string;
  lead_id: string;
  institution_id: string;
  activity_type: ActivityType;
  title: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  performed_by: string | null;
  created_at: string;
  // Virtual fields (populated from metadata when available)
  outcome?: string | null;
  scheduled_at?: string | null;
  completed_at?: string | null;
  performed_by_name?: string;
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
  institution_id?: string;
  activity_type: ActivityType;
  title?: string;
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
   * Normalize a DB row to the LeadActivity interface used by the rest of the code.
   * DB columns: title, performed_by, metadata → Code fields: subject, created_by, outcome, scheduled_at
   */
  private static normalizeActivity(row: any): LeadActivity {
    const meta = row.metadata || {};
    return {
      id: row.id,
      lead_id: row.lead_id,
      activity_type: row.activity_type,
      subject: row.title || null,
      description: row.description || null,
      outcome: meta.outcome || null,
      scheduled_at: meta.scheduled_at || null,
      created_by: row.performed_by || null,
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

    // Build metadata from optional fields that don't have dedicated DB columns
    const metadata: Record<string, unknown> = {};
    if (input.outcome) metadata.outcome = input.outcome;
    if (input.scheduled_at) metadata.scheduled_at = input.scheduled_at;

    const { data, error } = await this.supabase
      .from('admission_lead_activities')
      .insert({
        lead_id: input.lead_id,
        institution_id: input.institution_id || null,
        activity_type: input.activity_type,
        title: input.title || input.activity_type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        description: input.description || null,
        metadata: Object.keys(metadata).length > 0 ? metadata : {},
        performed_by: user?.id || null,
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
    // Map code fields to DB columns
    const dbUpdates: Record<string, unknown> = {};
    if (updates.activity_type !== undefined) dbUpdates.activity_type = updates.activity_type;
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;

    // For metadata fields (outcome, scheduled_at), merge into existing metadata
    if (updates.outcome !== undefined || updates.scheduled_at !== undefined) {
      const { data: current } = await this.supabase
        .from('admission_lead_activities')
        .select('metadata')
        .eq('id', id)
        .single();

      const meta = { ...(current?.metadata || {}) };
      if (updates.outcome !== undefined) meta.outcome = updates.outcome;
      if (updates.scheduled_at !== undefined) meta.scheduled_at = updates.scheduled_at;
      dbUpdates.metadata = meta;
    }

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

    // Transform activities to timeline entries
    const activityEntries: TimelineEntry[] = activities.map((activity) => ({
      id: activity.id,
      type: 'activity' as const,
      timestamp: activity.created_at,
      title: this.getActivityTitle(activity.activity_type),
      description: activity.title || activity.description,
      metadata: {
        activity_type: activity.activity_type,
        outcome: activity.outcome,
        scheduled_at: activity.scheduled_at,
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
      task: 'Task Completed',
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
