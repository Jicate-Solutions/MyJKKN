// lib/services/admission/activity-alert-service.ts
// Real-time Sales Alerts Service (Zing equivalent)
// Listens for lead activity events and sends instant notifications to counselors

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

// ============================================================================
// TYPES
// ============================================================================

export type AlertEventType =
  | 'wa_reply'
  | 'payment_initiated'
  | 'application_submitted'
  | 'lead_reengaged'
  | 'document_uploaded'
  | 'chatbot_handoff'
  | 'score_changed';

export interface ActivityAlertRule {
  id: string;
  institution_id: string;
  event_type: AlertEventType;
  is_enabled: boolean;
  notify_assigned_counselor: boolean;
  notify_additional_users: string[];
  notification_channels: string[];
  conditions: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateAlertRuleInput {
  institution_id: string;
  event_type: AlertEventType;
  is_enabled?: boolean;
  notify_assigned_counselor?: boolean;
  notify_additional_users?: string[];
  notification_channels?: string[];
  conditions?: Record<string, unknown>;
}

export interface UpdateAlertRuleInput {
  is_enabled?: boolean;
  notify_assigned_counselor?: boolean;
  notify_additional_users?: string[];
  notification_channels?: string[];
  conditions?: Record<string, unknown>;
}

export interface AlertHistoryEntry {
  id: string;
  institution_id: string;
  event_type: AlertEventType;
  lead_id: string;
  lead_name: string;
  message: string;
  notified_users: string[];
  channels_used: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AlertRuleFilters {
  institutionId?: string;   // undefined = all institutions (super admins)
  eventType?: AlertEventType;
  isEnabled?: boolean;
}

export interface AlertHistoryFilters {
  institutionId?: string;   // undefined = all institutions (super admins)
  eventType?: AlertEventType;
  leadId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

// Event-to-notification message templates
const EVENT_TEMPLATES: Record<AlertEventType, {
  title: string;
  messageTemplate: string;
}> = {
  wa_reply: {
    title: 'New WhatsApp Reply',
    messageTemplate: 'New WhatsApp from {{lead_name}}: "{{message_preview}}"',
  },
  payment_initiated: {
    title: 'Payment Initiated',
    messageTemplate: '{{lead_name}} just initiated {{amount}} fee payment for {{program}}',
  },
  application_submitted: {
    title: 'New Application',
    messageTemplate: 'New application from {{lead_name}} for {{program}}',
  },
  lead_reengaged: {
    title: 'Lead Re-engaged',
    messageTemplate: '{{lead_name}} (marked cold {{days_ago}} days ago) just became active again',
  },
  document_uploaded: {
    title: 'Document Uploaded',
    messageTemplate: '{{lead_name}} uploaded {{document_type}}',
  },
  chatbot_handoff: {
    title: 'Chatbot Handoff',
    messageTemplate: 'AI chatbot requesting handoff — prospect asking about {{topic}}',
  },
  score_changed: {
    title: 'Lead Score Changed',
    messageTemplate: '{{lead_name}}\'s score jumped from {{old_score}} to {{new_score}} — {{intent_level}}!',
  },
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class ActivityAlertService {
  // Browser (session-bound) client. Correct for the React-Query hooks in
  // hooks/admission/use-activity-alerts.ts, which run in the user's tab.
  //
  // On the SERVER this client carries no session, so every query runs as the
  // Postgres role `anon`. All RLS policies on activity_alert_rules /
  // activity_alert_history are `TO authenticated` only, so as `anon` reads
  // return an empty array (silently — HTTP 200, no error) and writes are
  // rejected. Server callers (app/api/admission/alerts/route.ts) therefore
  // MUST pass their own session-bound client via the optional `client`
  // parameter on every method below.
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // ALERT RULES CRUD
  // ============================================================================

  /**
   * Get all alert rules for an institution
   */
  static async getAlertRules(
    filters: AlertRuleFilters,
    client?: SupabaseClient
  ): Promise<ActivityAlertRule[]> {
    const db = client ?? this.supabase;
    let query = (db as any)
      .from('activity_alert_rules')
      .select('*')
      .order('event_type', { ascending: true });

    // Super admins pass undefined to see all institutions
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }

    if (filters.eventType) {
      query = query.eq('event_type', filters.eventType);
    }
    if (filters.isEnabled !== undefined) {
      query = query.eq('is_enabled', filters.isEnabled);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch alert rules: ${error.message}`);
    return (data || []) as ActivityAlertRule[];
  }

  /**
   * Get a single alert rule by ID
   */
  static async getAlertRule(id: string, client?: SupabaseClient): Promise<ActivityAlertRule | null> {
    const db = client ?? this.supabase;
    const { data, error } = await (db as any)
      .from('activity_alert_rules')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch alert rule: ${error.message}`);
    }
    return data as ActivityAlertRule;
  }

  /**
   * Create a new alert rule
   */
  static async createAlertRule(
    input: CreateAlertRuleInput,
    client?: SupabaseClient
  ): Promise<ActivityAlertRule> {
    const db = client ?? this.supabase;
    const { data, error } = await (db as any)
      .from('activity_alert_rules')
      .insert({
        institution_id: input.institution_id,
        event_type: input.event_type,
        is_enabled: input.is_enabled ?? true,
        notify_assigned_counselor: input.notify_assigned_counselor ?? true,
        notify_additional_users: input.notify_additional_users || [],
        notification_channels: input.notification_channels || ['PUSH', 'IN_APP'],
        conditions: input.conditions || {},
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create alert rule: ${error.message}`);
    return data as ActivityAlertRule;
  }

  /**
   * Update an alert rule
   */
  static async updateAlertRule(
    id: string,
    input: UpdateAlertRuleInput,
    client?: SupabaseClient
  ): Promise<ActivityAlertRule> {
    const db = client ?? this.supabase;
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (input.is_enabled !== undefined) updateData.is_enabled = input.is_enabled;
    if (input.notify_assigned_counselor !== undefined) updateData.notify_assigned_counselor = input.notify_assigned_counselor;
    if (input.notify_additional_users !== undefined) updateData.notify_additional_users = input.notify_additional_users;
    if (input.notification_channels !== undefined) updateData.notification_channels = input.notification_channels;
    if (input.conditions !== undefined) updateData.conditions = input.conditions;

    const { data, error } = await (db as any)
      .from('activity_alert_rules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update alert rule: ${error.message}`);
    return data as ActivityAlertRule;
  }

  /**
   * Delete an alert rule
   */
  static async deleteAlertRule(id: string, client?: SupabaseClient): Promise<void> {
    const db = client ?? this.supabase;
    const { error } = await (db as any)
      .from('activity_alert_rules')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete alert rule: ${error.message}`);
  }

  /**
   * Toggle an alert rule on/off
   */
  static async toggleAlertRule(
    id: string,
    isEnabled: boolean,
    client?: SupabaseClient
  ): Promise<ActivityAlertRule> {
    return this.updateAlertRule(id, { is_enabled: isEnabled }, client);
  }

  /**
   * Initialize default alert rules for an institution
   * Creates one rule per event type with default settings
   */
  static async initializeDefaultRules(
    institutionId: string,
    client?: SupabaseClient
  ): Promise<ActivityAlertRule[]> {
    const db = client ?? this.supabase;
    const eventTypes: AlertEventType[] = [
      'wa_reply', 'payment_initiated', 'application_submitted',
      'lead_reengaged', 'document_uploaded', 'chatbot_handoff', 'score_changed',
    ];

    // Check which rules already exist
    const existing = await this.getAlertRules({ institutionId }, client);
    const existingTypes = new Set(existing.map(r => r.event_type));

    const newRules: CreateAlertRuleInput[] = eventTypes
      .filter(type => !existingTypes.has(type))
      .map(type => ({
        institution_id: institutionId,
        event_type: type,
        is_enabled: true,
        notify_assigned_counselor: true,
        notify_additional_users: [],
        notification_channels: ['PUSH', 'IN_APP'],
        conditions: type === 'score_changed' ? { min_score_change: 20 } : {},
      }));

    if (newRules.length === 0) return existing;

    const { data, error } = await (db as any)
      .from('activity_alert_rules')
      .insert(newRules)
      .select();

    if (error) throw new Error(`Failed to initialize default rules: ${error.message}`);
    return [...existing, ...(data || [])] as ActivityAlertRule[];
  }

  // ============================================================================
  // ALERT HISTORY
  // ============================================================================

  /**
   * Get alert history
   */
  static async getAlertHistory(
    filters: AlertHistoryFilters,
    client?: SupabaseClient
  ): Promise<{
    entries: AlertHistoryEntry[];
    total: number;
  }> {
    const db = client ?? this.supabase;
    let query = (db as any)
      .from('activity_alert_history')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Super admins pass undefined to see all institutions
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }

    if (filters.eventType) query = query.eq('event_type', filters.eventType);
    if (filters.leadId) query = query.eq('lead_id', filters.leadId);
    if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
    if (filters.toDate) query = query.lte('created_at', filters.toDate);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch alert history: ${error.message}`);

    return {
      entries: (data || []) as AlertHistoryEntry[],
      total: count || 0,
    };
  }

  // ============================================================================
  // EVENT PROCESSING
  // ============================================================================

  /**
   * Process an activity event and trigger alerts if matching rules exist
   */
  static async processEvent(
    params: {
      institutionId: string;
      eventType: AlertEventType;
      leadId: string;
      leadName: string;
      counselorId?: string;
      metadata?: Record<string, unknown>;
    },
    client?: SupabaseClient
  ): Promise<{ alertSent: boolean; notifiedUsers: string[] }> {
    const db = client ?? this.supabase;

    // 1. Get matching enabled rules
    const rules = await this.getAlertRules({
      institutionId: params.institutionId,
      eventType: params.eventType,
      isEnabled: true,
    }, client);

    if (rules.length === 0) {
      return { alertSent: false, notifiedUsers: [] };
    }

    const rule = rules[0]; // One rule per event type per institution

    // 2. Check conditions
    if (!this.checkConditions(rule.conditions, params.metadata || {})) {
      return { alertSent: false, notifiedUsers: [] };
    }

    // 3. Determine who to notify
    const usersToNotify: string[] = [];
    if (rule.notify_assigned_counselor && params.counselorId) {
      usersToNotify.push(params.counselorId);
    }
    if (rule.notify_additional_users && rule.notify_additional_users.length > 0) {
      usersToNotify.push(...rule.notify_additional_users.filter(u => !usersToNotify.includes(u)));
    }

    if (usersToNotify.length === 0) {
      return { alertSent: false, notifiedUsers: [] };
    }

    // 4. Build notification message
    const template = EVENT_TEMPLATES[params.eventType];
    const message = this.renderTemplate(template.messageTemplate, {
      lead_name: params.leadName,
      ...(params.metadata as Record<string, string> || {}),
    });

    // 5. Send notifications via the shared fanout helper — writes ONE
    //    notifications row (real columns) + a user_notifications link per
    //    recipient. The previous inline insert used non-existent columns
    //    (user_id/type/message/action_url/action_label/channels) and never
    //    fanned out to user_notifications, so alerts never reached the bell.
    try {
      await fanoutNotification(db as any, {
        title: template.title,
        body: message,
        userIds: usersToNotify,
        createdBy: usersToNotify[0],
        category: 'admission',
        priority: params.eventType === 'payment_initiated' ? 'high' : 'normal',
        url: `/admission/leads/${params.leadId}`,
        targeting: { type: 'user', user_ids: usersToNotify },
        metadata: {
          event_type: params.eventType,
          lead_id: params.leadId,
          action_label: 'View Lead',
          channels: rule.notification_channels,
          ...params.metadata,
        },
        source: 'activity-alert',
      });
    } catch (err) {
      console.error('[activity-alert] Failed to send notifications:', err);
    }

    // 6. Log to history
    await (db as any)
      .from('activity_alert_history')
      .insert({
        institution_id: params.institutionId,
        event_type: params.eventType,
        lead_id: params.leadId,
        lead_name: params.leadName,
        message,
        notified_users: usersToNotify,
        channels_used: rule.notification_channels,
        metadata: params.metadata || {},
      });

    return { alertSent: true, notifiedUsers: usersToNotify };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Check if event conditions are met
   */
  private static checkConditions(
    conditions: Record<string, unknown>,
    metadata: Record<string, unknown>
  ): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    // Check min_score_change for score_changed events
    if (conditions.min_score_change && metadata.score_change) {
      const minChange = Number(conditions.min_score_change);
      const actualChange = Number(metadata.score_change);
      if (actualChange < minChange) return false;
    }

    // Check min_payment_amount for payment events
    if (conditions.min_payment_amount && metadata.amount) {
      const minAmount = Number(conditions.min_payment_amount);
      const actualAmount = Number(metadata.amount);
      if (actualAmount < minAmount) return false;
    }

    return true;
  }

  /**
   * Render a template string with variables
   */
  private static renderTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
    }
    // Remove any unreplaced variables
    result = result.replace(/{{[^}]+}}/g, '');
    return result.trim();
  }

  /**
   * Get available event types with labels
   */
  static getEventTypes(): Array<{
    value: AlertEventType;
    label: string;
    description: string;
  }> {
    return [
      { value: 'wa_reply', label: 'WhatsApp Reply', description: 'When a prospect replies on WhatsApp' },
      { value: 'payment_initiated', label: 'Payment Initiated', description: 'When a prospect initiates a payment' },
      { value: 'application_submitted', label: 'Application Submitted', description: 'When a new application is submitted' },
      { value: 'lead_reengaged', label: 'Lead Re-engaged', description: 'When a cold lead becomes active again' },
      { value: 'document_uploaded', label: 'Document Uploaded', description: 'When a prospect uploads a document' },
      { value: 'chatbot_handoff', label: 'Chatbot Handoff', description: 'When the AI chatbot requests human assistance' },
      { value: 'score_changed', label: 'Score Changed', description: 'When a lead score changes significantly' },
    ];
  }
}
