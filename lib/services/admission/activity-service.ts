// lib/services/admission/activity-service.ts
// Admission Lead Activities Service - Enhanced timeline functionality

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
  // Virtual fields
  created_by_name?: string;
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
  subject?: string;
  description?: string;
  outcome?: string;
  scheduled_at?: string;
  completed_at?: string;
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

    return data || [];
  }

  /**
   * Create a new activity
   */
  static async createActivity(input: CreateActivityInput): Promise<LeadActivity> {
    const { data, error } = await this.supabase
      .from('admission_lead_activities')
      .insert({
        lead_id: input.lead_id,
        activity_type: input.activity_type,
        subject: input.subject || null,
        description: input.description || null,
        outcome: input.outcome || null,
        scheduled_at: input.scheduled_at || null,
        completed_at: input.completed_at || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/activities] Failed to create activity:', error);
      throw new Error('Failed to create activity');
    }

    return data;
  }

  /**
   * Update an activity
   */
  static async updateActivity(id: string, updates: Partial<CreateActivityInput>): Promise<LeadActivity> {
    // Exclude lead_id from updates to prevent moving activities between leads
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { lead_id: _leadId, ...safeUpdates } = updates;

    const { data, error } = await this.supabase
      .from('admission_lead_activities')
      .update(safeUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/activities] Failed to update activity:', error);
      throw new Error('Failed to update activity');
    }

    return data;
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
      description: activity.subject || activity.description,
      metadata: {
        activity_type: activity.activity_type,
        outcome: activity.outcome,
        scheduled_at: activity.scheduled_at,
        completed_at: activity.completed_at,
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
