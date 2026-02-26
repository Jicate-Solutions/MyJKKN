// lib/services/admission/reminders-service.ts
// Service for follow-up reminders — queries admission_leads with next_followup_at

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface FollowUpReminder {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  leadEmail: string;
  leadStage: string;
  reminderType: 'scheduled' | 'no_response' | 'stage_based' | 'manual';
  dueDate: string;
  action: 'call' | 'whatsapp' | 'email' | 'task';
  message: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'completed' | 'snoozed' | 'dismissed';
  counselorId: string;
  counselorName: string;
  createdAt: string;
  completedAt?: string;
  isHotLead: boolean;
  isPriority: boolean;
}

export interface ReminderFilters {
  institutionId: string;
  counselorId?: string;
  dateRange?: { from: string; to: string };
}

// ============================================================================
// HELPERS
// ============================================================================

function classifyReminderType(lead: any): FollowUpReminder['reminderType'] {
  // If last_contact_at is null or more than 3 days old, it's a no-response follow-up
  if (!lead.last_contact_at) return 'no_response';
  const daysSinceContact = Math.floor(
    (Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceContact >= 3) return 'no_response';
  return 'scheduled';
}

function classifyAction(lead: any): FollowUpReminder['action'] {
  // Hot leads or overdue => call; otherwise whatsapp for quick follow-up
  if (lead.is_hot_lead || lead.is_priority) return 'call';
  const dueDate = new Date(lead.next_followup_at);
  const now = new Date();
  if (dueDate < now) return 'call'; // overdue leads get a call
  return 'whatsapp';
}

function classifyPriority(lead: any): FollowUpReminder['priority'] {
  // High: hot leads, priority leads, or no contact for 3+ days
  if (lead.is_hot_lead || lead.is_priority) return 'high';
  if (!lead.last_contact_at) return 'high';
  const daysSinceContact = Math.floor(
    (Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceContact >= 3) return 'high';
  if (daysSinceContact >= 1) return 'medium';
  return 'low';
}

function buildMessage(lead: any, reminderType: FollowUpReminder['reminderType']): string {
  const dueDate = new Date(lead.next_followup_at);
  const now = new Date();
  const isOverdue = dueDate < now;

  if (reminderType === 'no_response') {
    const days = lead.last_contact_at
      ? Math.floor((Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return days
      ? `No response for ${days} days - follow up recommended`
      : 'Never contacted - initial outreach needed';
  }
  if (isOverdue) {
    return `Overdue follow-up - was scheduled for ${dueDate.toLocaleDateString()}`;
  }
  return `Scheduled follow-up for ${lead.funnel_stage || 'lead'} stage`;
}

// ============================================================================
// SERVICE
// ============================================================================

export class RemindersService {
  /**
   * Fetch leads that have a follow-up date set (next_followup_at is not null).
   * Joins with admission_counselors for counselor name.
   * Classifies each as overdue/today/upcoming and assigns priority.
   */
  static async getFollowUpReminders(
    institutionId: string | undefined,
    filters?: Omit<ReminderFilters, 'institutionId'>
  ): Promise<FollowUpReminder[]> {
    const supabase = createClientSupabaseClient();

    let query = (supabase as any)
      .from('admission_leads')
      .select(
        'id, full_name, phone, email, funnel_stage, next_followup_at, counselor_id, last_contact_at, last_activity_at, is_hot_lead, is_priority, created_at, counselor:admission_counselors(id, name)'
      )
      .eq('is_active', true)
      .not('next_followup_at', 'is', null)
      .order('next_followup_at', { ascending: true });

    if (institutionId) query = query.eq('institution_id', institutionId);

    if (filters?.counselorId) {
      query = query.eq('counselor_id', filters.counselorId);
    }

    if (filters?.dateRange?.from) {
      query = query.gte('next_followup_at', filters.dateRange.from);
    }
    if (filters?.dateRange?.to) {
      query = query.lte('next_followup_at', filters.dateRange.to);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admission/reminders] Error fetching follow-up reminders:', error);
      throw new Error('Failed to fetch follow-up reminders');
    }

    return (data || []).map((lead: any): FollowUpReminder => {
      const reminderType = classifyReminderType(lead);
      const action = classifyAction(lead);
      const priority = classifyPriority(lead);
      const message = buildMessage(lead, reminderType);

      return {
        id: lead.id,
        leadId: lead.id,
        leadName: lead.full_name || 'Unknown',
        leadPhone: lead.phone || '',
        leadEmail: lead.email || '',
        leadStage: lead.funnel_stage || 'new',
        reminderType,
        dueDate: lead.next_followup_at,
        action,
        message,
        priority,
        status: 'pending',
        counselorId: lead.counselor_id || '',
        counselorName: lead.counselor?.name || 'Unassigned',
        createdAt: lead.created_at,
        isHotLead: lead.is_hot_lead || false,
        isPriority: lead.is_priority || false,
      };
    });
  }

  /**
   * Snooze a reminder by updating the lead's next_followup_at to tomorrow.
   */
  static async snoozeReminder(leadId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // Snooze to 9 AM tomorrow

    const { error } = await (supabase as any)
      .from('admission_leads')
      .update({ next_followup_at: tomorrow.toISOString() })
      .eq('id', leadId);

    if (error) {
      console.error('[admission/reminders] Error snoozing reminder:', error);
      throw new Error('Failed to snooze reminder');
    }
  }

  /**
   * Complete a reminder by clearing the lead's next_followup_at
   * and updating last_contact_at.
   */
  static async completeReminder(leadId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const now = new Date().toISOString();

    const { error } = await (supabase as any)
      .from('admission_leads')
      .update({
        next_followup_at: null,
        last_contact_at: now,
        last_activity_at: now,
      })
      .eq('id', leadId);

    if (error) {
      console.error('[admission/reminders] Error completing reminder:', error);
      throw new Error('Failed to complete reminder');
    }
  }

  /**
   * Reschedule a reminder by updating next_followup_at to a new date.
   */
  static async rescheduleReminder(leadId: string, newDate: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('admission_leads')
      .update({
        next_followup_at: newDate,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (error) {
      console.error('[admission/reminders] Error rescheduling reminder:', error);
      throw new Error('Failed to reschedule reminder');
    }
  }

  /**
   * Dismiss a reminder by clearing next_followup_at
   * without updating last_contact_at (unlike complete).
   */
  static async dismissReminder(leadId: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('admission_leads')
      .update({
        next_followup_at: null,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (error) {
      console.error('[admission/reminders] Error dismissing reminder:', error);
      throw new Error('Failed to dismiss reminder');
    }
  }

  /**
   * Create a manual reminder by setting next_followup_at on a lead.
   */
  static async createReminder(leadId: string, dueDate: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('admission_leads')
      .update({
        next_followup_at: dueDate,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (error) {
      console.error('[admission/reminders] Error creating reminder:', error);
      throw new Error('Failed to create reminder');
    }
  }

  /**
   * Search leads for creating reminders.
   */
  static async searchLeadsForReminder(
    institutionId: string,
    search: string
  ): Promise<{ id: string; fullName: string; phone: string; stage: string }[]> {
    const supabase = createClientSupabaseClient();
    const sanitized = search.replace(/[%_]/g, '');

    const { data, error } = await (supabase as any)
      .from('admission_leads')
      .select('id, full_name, phone, funnel_stage')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .or(`full_name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%`)
      .order('full_name', { ascending: true })
      .limit(20);

    if (error) {
      console.error('[admission/reminders] Error searching leads:', error);
      throw new Error('Failed to search leads');
    }

    return (data || []).map((lead: any) => ({
      id: lead.id,
      fullName: lead.full_name || 'Unknown',
      phone: lead.phone || '',
      stage: lead.funnel_stage || 'new',
    }));
  }
}
