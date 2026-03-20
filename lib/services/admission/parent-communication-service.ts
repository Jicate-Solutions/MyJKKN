// lib/services/admission/parent-communication-service.ts
// Service for parent communication module - queries leads with parent info + communication logs

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface LeadWithParents {
  id: string;
  full_name: string;
  phone: string;
  stage: string;
  funnel_stage: string;
  interested_programs: string[];
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  parent_opted_in: boolean;
  last_contact_at: string | null;
  last_activity_at: string | null;
  engagement_score: number;
  institution_id: string;
}

export interface CommunicationLogEntry {
  id: string;
  lead_id: string;
  channel: 'sms' | 'whatsapp';
  recipient_phone: string;
  message_content: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface ParentCommStats {
  totalLeadsWithParentInfo: number;
  totalLeadsWithoutParentInfo: number;
  totalParentContacts: number;
  recentCommunications: number;
  avgEngagement: number;
}

export interface ParentCommFilters {
  institutionId: string;
  search?: string;
  hasParentInfo?: boolean;
  limit?: number;
  offset?: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class ParentCommunicationService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get leads with parent information
   */
  static async getLeadsWithParentInfo(
    filters: ParentCommFilters
  ): Promise<{ leads: LeadWithParents[]; total: number }> {
    let query = (this.supabase as any)
      .from('admission_leads')
      .select(
        'id, full_name, phone, funnel_stage, interested_programs, parent_name, parent_phone, parent_email, parent_opted_in, last_contact_at, last_activity_at, engagement_score, institution_id',
        { count: 'exact' }
      )
      .eq('institution_id', filters.institutionId)
      .eq('is_active', true)
      .order('last_activity_at', { ascending: false, nullsFirst: false });

    if (filters.search) {
      const s = filters.search.replace(/[%_\\]/g, '\\$&');
      query = query.or(
        `full_name.ilike.%${s}%,parent_name.ilike.%${s}%,parent_phone.ilike.%${s}%,phone.ilike.%${s}%`
      );
    }

    if (filters.hasParentInfo === true) {
      query = query.not('parent_name', 'is', null);
    } else if (filters.hasParentInfo === false) {
      query = query.is('parent_name', null);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit || 50) - 1
      );
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('[admission/parent-communication] Error fetching leads:', error);
      throw new Error('Failed to fetch leads with parent info');
    }

    return {
      leads: (data || []) as LeadWithParents[],
      total: count || 0,
    };
  }

  /**
   * Get recent communication logs (SMS + WhatsApp) for parent communication
   */
  static async getCommunicationLogs(
    institutionId: string,
    options?: { limit?: number; leadId?: string }
  ): Promise<CommunicationLogEntry[]> {
    const limit = options?.limit || 50;

    // Fetch SMS logs
    let smsQuery = (this.supabase as any)
      .from('admission_sms_logs')
      .select('id, lead_id, phone_number, message_content, status, sent_at, delivered_at, created_at')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (options?.leadId) {
      smsQuery = smsQuery.eq('lead_id', options.leadId);
    }

    // Fetch WhatsApp logs
    let waQuery = (this.supabase as any)
      .from('admission_whatsapp_logs')
      .select('id, lead_id, recipient_phone, message_content, delivery_status, sent_at, delivered_at, created_at')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (options?.leadId) {
      waQuery = waQuery.eq('lead_id', options.leadId);
    }

    const [smsResult, waResult] = await Promise.all([smsQuery, waQuery]);

    const smsLogs: CommunicationLogEntry[] = (smsResult.data || []).map(
      (log: any) => ({
        id: log.id,
        lead_id: log.lead_id,
        channel: 'sms' as const,
        recipient_phone: log.phone_number,
        message_content: log.message_content,
        status: log.status,
        sent_at: log.sent_at,
        delivered_at: log.delivered_at,
        created_at: log.created_at,
      })
    );

    const waLogs: CommunicationLogEntry[] = (waResult.data || []).map(
      (log: any) => ({
        id: log.id,
        lead_id: log.lead_id,
        channel: 'whatsapp' as const,
        recipient_phone: log.recipient_phone,
        message_content: log.message_content,
        status: log.delivery_status,
        sent_at: log.sent_at,
        delivered_at: log.delivered_at,
        created_at: log.created_at,
      })
    );

    // Merge and sort by created_at desc
    const allLogs = [...smsLogs, ...waLogs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return allLogs.slice(0, limit);
  }

  /**
   * Get parent communication stats
   */
  static async getStats(institutionId: string): Promise<ParentCommStats> {
    const [withParentResult, withoutParentResult, logsResult] =
      await Promise.all([
        (this.supabase as any)
          .from('admission_leads')
          .select('id, engagement_score', { count: 'exact' })
          .eq('institution_id', institutionId)
          .eq('is_active', true)
          .not('parent_name', 'is', null),
        (this.supabase as any)
          .from('admission_leads')
          .select('id', { count: 'exact' })
          .eq('institution_id', institutionId)
          .eq('is_active', true)
          .is('parent_name', null),
        // Recent communications (last 7 days) from both SMS and WhatsApp
        (this.supabase as any)
          .from('admission_sms_logs')
          .select('id', { count: 'exact' })
          .eq('institution_id', institutionId)
          .gte(
            'created_at',
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          ),
      ]);

    // Also get WhatsApp recent count
    const waLogsResult = await (this.supabase as any)
      .from('admission_whatsapp_logs')
      .select('id', { count: 'exact' })
      .eq('institution_id', institutionId)
      .gte(
        'created_at',
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      );

    const leadsWithParent = withParentResult.data || [];
    const totalWithParent = withParentResult.count || 0;
    const totalWithoutParent = withoutParentResult.count || 0;
    const recentSMS = logsResult.count || 0;
    const recentWA = waLogsResult.count || 0;

    const avgEngagement =
      leadsWithParent.length > 0
        ? Math.round(
            leadsWithParent.reduce(
              (acc: number, l: any) => acc + (l.engagement_score || 0),
              0
            ) / leadsWithParent.length
          )
        : 0;

    return {
      totalLeadsWithParentInfo: totalWithParent,
      totalLeadsWithoutParentInfo: totalWithoutParent,
      totalParentContacts: totalWithParent,
      recentCommunications: recentSMS + recentWA,
      avgEngagement,
    };
  }

  /**
   * Update parent info on a lead
   */
  static async updateParentInfo(
    leadId: string,
    parentData: {
      parent_name: string;
      parent_phone: string;
      parent_email?: string;
      parent_opted_in?: boolean;
    }
  ): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('admission_leads')
      .update({
        ...parentData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (error) {
      console.error('[admission/parent-communication] Error updating parent info:', error);
      throw new Error('Failed to update parent info');
    }
  }
}
