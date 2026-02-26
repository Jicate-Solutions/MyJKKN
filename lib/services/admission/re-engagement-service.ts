// lib/services/admission/re-engagement-service.ts
// Service for cold lead re-engagement module

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface ColdLead {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  interested_programs: string[];
  source: string;
  last_contact_at: string | null;
  last_activity_at: string | null;
  daysSinceContact: number;
  funnel_stage: string;
  previous_stage: string | null;
  lost_reason: string | null;
  is_dormant: boolean;
  dormant_at: string | null;
  score: number;
  engagement_score: number;
  institution_id: string;
}

export interface ReEngagementCampaign {
  id: string;
  institution_id: string;
  workflow_id: string | null;
  lead_id: string;
  status: string;
  current_step_index: number;
  total_steps: number;
  started_at: string;
  completed_at: string | null;
  paused_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface ReEngagementStats {
  totalColdLeads: number;
  veryColdLeads: number;
  neverEngaged: number;
  activeCampaigns: number;
  dormantLeads: number;
}

export interface ColdLeadFilters {
  institutionId: string;
  minDaysInactive?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class ReEngagementService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get cold/dormant leads
   * Cold leads: those who haven't been contacted recently or are marked dormant
   */
  static async getColdLeads(
    filters: ColdLeadFilters
  ): Promise<{ leads: ColdLead[]; total: number }> {
    const cutoffDate = new Date(
      Date.now() - (filters.minDaysInactive || 14) * 24 * 60 * 60 * 1000
    ).toISOString();

    let query = (this.supabase as any)
      .from('admission_leads')
      .select(
        'id, full_name, email, phone, interested_programs, source, last_contact_at, last_activity_at, funnel_stage, previous_stage, lost_reason, is_dormant, dormant_at, score, engagement_score, institution_id',
        { count: 'exact' }
      )
      .eq('institution_id', filters.institutionId)
      .eq('is_active', true)
      .or(
        `is_dormant.eq.true,last_contact_at.lt.${cutoffDate},last_contact_at.is.null`
      )
      .order('last_contact_at', { ascending: true, nullsFirst: true });

    if (filters.search) {
      const s = filters.search.replace(/[%_\\]/g, '\\$&');
      query = query.or(
        `full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`
      );
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
      console.error('[admission/re-engagement] Error fetching cold leads:', error);
      throw new Error('Failed to fetch cold leads');
    }

    const now = Date.now();
    const leads: ColdLead[] = (data || []).map((lead: any) => ({
      ...lead,
      daysSinceContact: lead.last_contact_at
        ? Math.floor(
            (now - new Date(lead.last_contact_at).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 999,
    }));

    return { leads, total: count || 0 };
  }

  /**
   * Get active drip sequences (re-engagement campaigns)
   */
  static async getCampaigns(
    institutionId: string
  ): Promise<ReEngagementCampaign[]> {
    const { data, error } = await (this.supabase as any)
      .from('admission_drip_sequences')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[admission/re-engagement] Error fetching campaigns:', error);
      throw new Error('Failed to fetch campaigns');
    }

    return (data || []) as ReEngagementCampaign[];
  }

  /**
   * Get re-engagement stats
   */
  static async getStats(institutionId: string): Promise<ReEngagementStats> {
    const fourteenDaysAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000
    ).toISOString();
    const sixtyDaysAgo = new Date(
      Date.now() - 60 * 24 * 60 * 60 * 1000
    ).toISOString();

    const [coldResult, veryColdResult, dormantResult, campaignResult] =
      await Promise.all([
        // Total cold leads (14+ days inactive)
        (this.supabase as any)
          .from('admission_leads')
          .select('id', { count: 'exact' })
          .eq('institution_id', institutionId)
          .eq('is_active', true)
          .or(
            `is_dormant.eq.true,last_contact_at.lt.${fourteenDaysAgo},last_contact_at.is.null`
          ),
        // Very cold (60+ days)
        (this.supabase as any)
          .from('admission_leads')
          .select('id', { count: 'exact' })
          .eq('institution_id', institutionId)
          .eq('is_active', true)
          .or(
            `last_contact_at.lt.${sixtyDaysAgo},last_contact_at.is.null`
          ),
        // Dormant leads
        (this.supabase as any)
          .from('admission_leads')
          .select('id', { count: 'exact' })
          .eq('institution_id', institutionId)
          .eq('is_dormant', true),
        // Active campaigns
        (this.supabase as any)
          .from('admission_drip_sequences')
          .select('id', { count: 'exact' })
          .eq('institution_id', institutionId)
          .eq('status', 'active'),
      ]);

    return {
      totalColdLeads: coldResult.count || 0,
      veryColdLeads: veryColdResult.count || 0,
      neverEngaged: 0, // Would need message counts per lead - simplified
      activeCampaigns: campaignResult.count || 0,
      dormantLeads: dormantResult.count || 0,
    };
  }

  /**
   * Mark a cold lead as hot (re-engaged)
   */
  static async markAsHot(leadId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('admission_leads')
      .update({
        is_hot_lead: true,
        is_dormant: false,
        dormant_at: null,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (error) {
      console.error('[admission/re-engagement] Error marking lead as hot:', error);
      throw new Error('Failed to mark lead as hot');
    }
  }
}
