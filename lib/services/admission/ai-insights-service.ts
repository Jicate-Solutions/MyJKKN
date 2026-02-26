// lib/services/admission/ai-insights-service.ts
// AI Insights Service - CRM-focused actionable insights

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AdmissionLead, FunnelStage } from '@/types/admission';

// ============================================================================
// TYPES
// ============================================================================

export type InsightType =
  | 'follow_up_reminder'
  | 'conversion_opportunity'
  | 'engagement_alert'
  | 'trend_insight'
  | 'anomaly_detection'
  | 'recommendation'
  | 'performance_insight';

export type InsightPriority = 'critical' | 'high' | 'medium' | 'low';

export type InsightAction =
  | 'contact_lead'
  | 'schedule_followup'
  | 'send_campaign'
  | 'assign_counselor'
  | 'review_leads'
  | 'update_strategy'
  | 'view_report'
  | 'no_action';

export interface AIInsight {
  id: string;
  institution_id: string;
  type: InsightType;
  priority: InsightPriority;
  title: string;
  description: string;
  action_type: InsightAction;
  action_data: Record<string, unknown>;
  action_url?: string;
  related_lead_ids: string[];
  related_counselor_ids: string[];
  metric_value?: number;
  metric_change?: number;
  metric_label?: string;
  is_dismissed: boolean;
  dismissed_at?: string;
  dismissed_by?: string;
  expires_at?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InsightFilters {
  institution_id: string;
  type?: InsightType | InsightType[];
  priority?: InsightPriority | InsightPriority[];
  is_dismissed?: boolean;
  include_expired?: boolean;
  limit?: number;
}

export interface TrendData {
  label: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  direction: 'up' | 'down' | 'stable';
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: InsightPriority;
  actionType: InsightAction;
  actionLabel: string;
  actionUrl?: string;
  impact: string;
}

export interface Anomaly {
  id: string;
  title: string;
  description: string;
  severity: InsightPriority;
  metric: string;
  expected: number;
  actual: number;
  deviation: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class AIInsightsService {
  private static supabase = createClientSupabaseClient();

  // ==========================================================================
  // INSIGHTS CRUD
  // ==========================================================================

  /**
   * Get all active insights for an institution
   */
  static async getInsights(filters: InsightFilters): Promise<AIInsight[]> {
    let query = (this.supabase as any)
      .from('admission_ai_insights')
      .select('*')
      .eq('institution_id', filters.institution_id)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (filters.type) {
      if (Array.isArray(filters.type)) {
        query = query.in('type', filters.type);
      } else {
        query = query.eq('type', filters.type);
      }
    }

    if (filters.priority) {
      if (Array.isArray(filters.priority)) {
        query = query.in('priority', filters.priority);
      } else {
        query = query.eq('priority', filters.priority);
      }
    }

    if (filters.is_dismissed !== undefined) {
      query = query.eq('is_dismissed', filters.is_dismissed);
    }

    if (!filters.include_expired) {
      query = query.or('expires_at.is.null,expires_at.gt.now()');
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[AIInsightsService] Error fetching insights:', error);
      throw new Error(`Failed to fetch insights: ${error.message}`);
    }

    return (data || []) as AIInsight[];
  }

  /**
   * Dismiss an insight
   */
  static async dismissInsight(insightId: string): Promise<void> {
    const { data: { user } } = await (this.supabase as any).auth.getUser();

    const { error } = await (this.supabase as any)
      .from('admission_ai_insights')
      .update({
        is_dismissed: true,
        dismissed_at: new Date().toISOString(),
        dismissed_by: user?.id || null,
      })
      .eq('id', insightId);

    if (error) {
      console.error('[AIInsightsService] Error dismissing insight:', error);
      throw new Error(`Failed to dismiss insight: ${error.message}`);
    }
  }

  // ==========================================================================
  // INSIGHT GENERATION
  // ==========================================================================

  /**
   * Generate and store insights by analyzing lead data
   */
  static async generateInsights(institutionId: string): Promise<AIInsight[]> {
    const insights: Omit<AIInsight, 'id' | 'created_at' | 'updated_at'>[] = [];

    try {
      // Fetch leads data
      const { data: leads, error: leadsError } = await (this.supabase as any)
        .from('admission_leads')
        .select(`
          *,
          counselor:admission_counselors(id, name)
        `)
        .eq('institution_id', institutionId);

      if (leadsError) {
        console.error('[AIInsightsService] Error fetching leads:', leadsError);
        throw leadsError;
      }

      const allLeads = (leads || []) as AdmissionLead[];

      // Generate various insights
      const hotLeadsInsight = this.analyzeHotLeadsNoContact(allLeads, institutionId);
      if (hotLeadsInsight) insights.push(hotLeadsInsight);

      const staleLeadsInsight = this.analyzeStaleLeads(allLeads, institutionId);
      if (staleLeadsInsight) insights.push(staleLeadsInsight);

      const conversionInsight = this.analyzeConversionOpportunities(allLeads, institutionId);
      if (conversionInsight) insights.push(conversionInsight);

      const sourceInsight = this.analyzeSourcePerformance(allLeads, institutionId);
      if (sourceInsight) insights.push(sourceInsight);

      const todayFollowupsInsight = this.analyzeTodayFollowups(allLeads, institutionId);
      if (todayFollowupsInsight) insights.push(todayFollowupsInsight);

      const overdueFollowupsInsight = this.analyzeOverdueFollowups(allLeads, institutionId);
      if (overdueFollowupsInsight) insights.push(overdueFollowupsInsight);

      const unassignedLeadsInsight = this.analyzeUnassignedLeads(allLeads, institutionId);
      if (unassignedLeadsInsight) insights.push(unassignedLeadsInsight);

      const weeklyTrendInsight = this.analyzeWeeklyTrend(allLeads, institutionId);
      if (weeklyTrendInsight) insights.push(weeklyTrendInsight);

      // Clear existing non-dismissed insights and insert new ones
      await (this.supabase as any)
        .from('admission_ai_insights')
        .delete()
        .eq('institution_id', institutionId)
        .eq('is_dismissed', false);

      if (insights.length > 0) {
        const { data: inserted, error: insertError } = await (this.supabase as any)
          .from('admission_ai_insights')
          .insert(insights)
          .select();

        if (insertError) {
          console.error('[AIInsightsService] Error inserting insights:', insertError);
          throw insertError;
        }

        return (inserted || []) as AIInsight[];
      }

      return [];
    } catch (error) {
      console.error('[AIInsightsService] Error generating insights:', error);
      throw error;
    }
  }

  // ==========================================================================
  // INSIGHT ANALYSIS METHODS
  // ==========================================================================

  /**
   * Find hot leads that haven't been contacted in X days
   */
  private static analyzeHotLeadsNoContact(
    leads: AdmissionLead[],
    institutionId: string
  ): Omit<AIInsight, 'id' | 'created_at' | 'updated_at'> | null {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const hotLeadsNoContact = leads.filter(lead => {
      if (!lead.is_hot_lead) return false;
      if (lead.funnel_stage === 'lost' || lead.funnel_stage === 'enrolled') return false;

      const lastContact = lead.last_contact_at
        ? new Date(lead.last_contact_at)
        : new Date(lead.created_at);

      return lastContact < threeDaysAgo;
    });

    if (hotLeadsNoContact.length === 0) return null;

    return {
      institution_id: institutionId,
      type: 'follow_up_reminder',
      priority: 'critical',
      title: `${hotLeadsNoContact.length} hot leads need attention`,
      description: `These hot leads haven't been contacted in over 3 days. Immediate follow-up recommended to prevent losing potential conversions.`,
      action_type: 'contact_lead',
      action_data: { lead_count: hotLeadsNoContact.length },
      action_url: '/admission/leads?is_hot_lead=true&sort_by=last_contact_at&sort_order=asc',
      related_lead_ids: hotLeadsNoContact.map(l => l.id),
      related_counselor_ids: [],
      metric_value: hotLeadsNoContact.length,
      metric_label: 'Hot leads needing contact',
      is_dismissed: false,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        average_days_since_contact: Math.round(
          hotLeadsNoContact.reduce((sum, lead) => {
            const lastContact = lead.last_contact_at
              ? new Date(lead.last_contact_at)
              : new Date(lead.created_at);
            return sum + (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
          }, 0) / hotLeadsNoContact.length
        ),
      },
    };
  }

  /**
   * Find stale leads in early stages
   */
  private static analyzeStaleLeads(
    leads: AdmissionLead[],
    institutionId: string
  ): Omit<AIInsight, 'id' | 'created_at' | 'updated_at'> | null {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const earlyStages: FunnelStage[] = ['new', 'contacted', 'qualified'];

    const staleLeads = leads.filter(lead => {
      if (!earlyStages.includes(lead.funnel_stage)) return false;

      const lastUpdate = new Date(lead.updated_at);
      return lastUpdate < sevenDaysAgo;
    });

    if (staleLeads.length < 5) return null;

    return {
      institution_id: institutionId,
      type: 'engagement_alert',
      priority: 'high',
      title: `${staleLeads.length} leads stuck in early stages`,
      description: `These leads haven't progressed in over a week. Consider re-engagement campaigns or reassigning to active counselors.`,
      action_type: 'review_leads',
      action_data: { lead_count: staleLeads.length, stages: earlyStages },
      action_url: '/admission/leads?funnel_stage=new,contacted,qualified&sort_by=updated_at&sort_order=asc',
      related_lead_ids: staleLeads.slice(0, 20).map(l => l.id),
      related_counselor_ids: [],
      metric_value: staleLeads.length,
      metric_label: 'Stale leads',
      is_dismissed: false,
      metadata: {},
    };
  }

  /**
   * Find leads close to conversion
   */
  private static analyzeConversionOpportunities(
    leads: AdmissionLead[],
    institutionId: string
  ): Omit<AIInsight, 'id' | 'created_at' | 'updated_at'> | null {
    const lateStages: FunnelStage[] = [
      'offer_sent',
      'offer_accepted',
      'token_paid',
    ];

    const nearConversion = leads.filter(lead =>
      lateStages.includes(lead.funnel_stage)
    );

    if (nearConversion.length === 0) return null;

    return {
      institution_id: institutionId,
      type: 'conversion_opportunity',
      priority: 'high',
      title: `${nearConversion.length} leads close to enrollment`,
      description: `These leads are in late stages. Focus attention here for quick wins and improved conversion rates.`,
      action_type: 'contact_lead',
      action_data: { lead_count: nearConversion.length, stages: lateStages },
      action_url: '/admission/leads?funnel_stage=offer_sent,offer_accepted,token_paid',
      related_lead_ids: nearConversion.map(l => l.id),
      related_counselor_ids: [],
      metric_value: nearConversion.length,
      metric_label: 'Near conversion',
      is_dismissed: false,
      metadata: {
        by_stage: {
          offer_sent: nearConversion.filter(l => l.funnel_stage === 'offer_sent').length,
          offer_accepted: nearConversion.filter(l => l.funnel_stage === 'offer_accepted').length,
          token_paid: nearConversion.filter(l => l.funnel_stage === 'token_paid').length,
        },
      },
    };
  }

  /**
   * Analyze source performance
   */
  private static analyzeSourcePerformance(
    leads: AdmissionLead[],
    institutionId: string
  ): Omit<AIInsight, 'id' | 'created_at' | 'updated_at'> | null {
    const sourceStats: Record<string, { total: number; converted: number }> = {};

    leads.forEach(lead => {
      const source = lead.source || 'unknown';
      if (!sourceStats[source]) {
        sourceStats[source] = { total: 0, converted: 0 };
      }
      sourceStats[source].total++;
      if (lead.funnel_stage === 'enrolled') {
        sourceStats[source].converted++;
      }
    });

    // Find best performing source
    let bestSource = '';
    let bestRate = 0;
    let bestCount = 0;

    Object.entries(sourceStats).forEach(([source, stats]) => {
      if (stats.total >= 10) { // Minimum sample size
        const rate = stats.total > 0 ? stats.converted / stats.total : 0;
        if (rate > bestRate) {
          bestRate = rate;
          bestSource = source;
          bestCount = stats.total;
        }
      }
    });

    if (!bestSource || bestRate < 0.1) return null;

    return {
      institution_id: institutionId,
      type: 'trend_insight',
      priority: 'medium',
      title: `${bestSource.replace('_', ' ')} has highest conversion rate`,
      description: `Leads from ${bestSource.replace('_', ' ')} convert at ${(bestRate * 100).toFixed(1)}%. Consider increasing investment in this channel.`,
      action_type: 'update_strategy',
      action_data: {
        source: bestSource,
        conversion_rate: bestRate,
        total_leads: bestCount,
      },
      action_url: `/admission/leads?source=${bestSource}`,
      related_lead_ids: [],
      related_counselor_ids: [],
      metric_value: bestRate * 100,
      metric_change: 0,
      metric_label: 'Conversion rate %',
      is_dismissed: false,
      metadata: { all_sources: sourceStats },
    };
  }

  /**
   * Analyze leads needing follow-up today
   * NOTE: next_followup_at column does not exist in DB.
   * Instead, we identify leads not contacted in 3+ days that are in active stages.
   */
  private static analyzeTodayFollowups(
    leads: AdmissionLead[],
    institutionId: string
  ): Omit<AIInsight, 'id' | 'created_at' | 'updated_at'> | null {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const todayFollowups = leads.filter(lead => {
      if (lead.funnel_stage === 'lost' || lead.funnel_stage === 'enrolled') return false;
      // Leads not contacted in 3+ days need follow-up
      const lastContact = lead.last_contact_at
        ? new Date(lead.last_contact_at)
        : null;
      if (!lastContact) return true; // Never contacted = needs follow-up
      return lastContact < threeDaysAgo;
    });

    if (todayFollowups.length === 0) return null;

    return {
      institution_id: institutionId,
      type: 'follow_up_reminder',
      priority: 'high',
      title: `${todayFollowups.length} leads need follow-up`,
      description: `These leads haven't been contacted in 3+ days. Follow up to maintain engagement momentum.`,
      action_type: 'contact_lead',
      action_data: { lead_count: todayFollowups.length },
      action_url: '/admission/leads?sort_by=last_contact_at&sort_order=asc',
      related_lead_ids: todayFollowups.map(l => l.id),
      related_counselor_ids: [],
      metric_value: todayFollowups.length,
      metric_label: 'Leads needing follow-up',
      is_dismissed: false,
      expires_at: tomorrow.toISOString(),
      metadata: {},
    };
  }

  /**
   * Analyze overdue followups
   * NOTE: next_followup_at column does not exist in DB.
   * Instead, we identify leads not contacted in 7+ days that are in active stages.
   */
  private static analyzeOverdueFollowups(
    leads: AdmissionLead[],
    institutionId: string
  ): Omit<AIInsight, 'id' | 'created_at' | 'updated_at'> | null {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const overdueFollowups = leads.filter(lead => {
      if (lead.funnel_stage === 'lost' || lead.funnel_stage === 'enrolled') return false;
      const lastContact = lead.last_contact_at
        ? new Date(lead.last_contact_at)
        : null;
      // Leads never contacted or not contacted in 7+ days are overdue
      if (!lastContact) return true;
      return lastContact < sevenDaysAgo;
    });

    if (overdueFollowups.length === 0) return null;

    return {
      institution_id: institutionId,
      type: 'engagement_alert',
      priority: overdueFollowups.length > 10 ? 'critical' : 'high',
      title: `${overdueFollowups.length} overdue follow-ups`,
      description: `These leads haven't been contacted in over 7 days. Prompt action needed to re-engage.`,
      action_type: 'schedule_followup',
      action_data: { lead_count: overdueFollowups.length },
      action_url: '/admission/leads?sort_by=last_contact_at&sort_order=asc',
      related_lead_ids: overdueFollowups.slice(0, 20).map(l => l.id),
      related_counselor_ids: [],
      metric_value: overdueFollowups.length,
      metric_label: 'Overdue follow-ups',
      is_dismissed: false,
      metadata: {},
    };
  }

  /**
   * Analyze unassigned leads
   */
  private static analyzeUnassignedLeads(
    leads: AdmissionLead[],
    institutionId: string
  ): Omit<AIInsight, 'id' | 'created_at' | 'updated_at'> | null {
    const unassigned = leads.filter(lead => {
      if (lead.funnel_stage === 'lost' || lead.funnel_stage === 'enrolled') return false;
      return !lead.counselor_id;
    });

    if (unassigned.length < 3) return null;

    return {
      institution_id: institutionId,
      type: 'recommendation',
      priority: unassigned.length > 10 ? 'high' : 'medium',
      title: `${unassigned.length} leads without counselor`,
      description: `Unassigned leads may not receive timely attention. Consider using auto-assignment rules.`,
      action_type: 'assign_counselor',
      action_data: { lead_count: unassigned.length },
      action_url: '/admission/leads?counselor_id=unassigned',
      related_lead_ids: unassigned.slice(0, 20).map(l => l.id),
      related_counselor_ids: [],
      metric_value: unassigned.length,
      metric_label: 'Unassigned leads',
      is_dismissed: false,
      metadata: {},
    };
  }

  /**
   * Analyze weekly lead trend
   */
  private static analyzeWeeklyTrend(
    leads: AdmissionLead[],
    institutionId: string
  ): Omit<AIInsight, 'id' | 'created_at' | 'updated_at'> | null {
    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const thisWeek = leads.filter(lead => new Date(lead.created_at) >= oneWeekAgo);
    const lastWeek = leads.filter(lead => {
      const created = new Date(lead.created_at);
      return created >= twoWeeksAgo && created < oneWeekAgo;
    });

    const thisWeekCount = thisWeek.length;
    const lastWeekCount = lastWeek.length;

    if (lastWeekCount === 0 && thisWeekCount === 0) return null;

    const change = lastWeekCount > 0
      ? ((thisWeekCount - lastWeekCount) / lastWeekCount) * 100
      : thisWeekCount > 0 ? 100 : 0;

    const direction = change > 10 ? 'up' : change < -10 ? 'down' : 'stable';
    const priority: InsightPriority = Math.abs(change) > 30 ? 'high' : 'medium';

    return {
      institution_id: institutionId,
      type: 'trend_insight',
      priority,
      title: direction === 'up'
        ? `Lead volume up ${Math.abs(change).toFixed(0)}% this week`
        : direction === 'down'
        ? `Lead volume down ${Math.abs(change).toFixed(0)}% this week`
        : 'Lead volume stable this week',
      description: `This week: ${thisWeekCount} leads. Last week: ${lastWeekCount} leads. ${
        direction === 'up'
          ? 'Great momentum! Ensure counselor capacity matches demand.'
          : direction === 'down'
          ? 'Consider reviewing marketing campaigns or seasonal factors.'
          : 'Consistent lead flow indicates stable marketing performance.'
      }`,
      action_type: 'view_report',
      action_data: {
        this_week: thisWeekCount,
        last_week: lastWeekCount,
        change_percent: change,
      },
      action_url: '/admission/analytics',
      related_lead_ids: [],
      related_counselor_ids: [],
      metric_value: thisWeekCount,
      metric_change: change,
      metric_label: 'Leads this week',
      is_dismissed: false,
      metadata: {},
    };
  }

  // ==========================================================================
  // RECOMMENDATIONS
  // ==========================================================================

  /**
   * Get actionable recommendations based on current data
   */
  static async getRecommendations(institutionId: string): Promise<Recommendation[]> {
    const insights = await this.getInsights({
      institution_id: institutionId,
      is_dismissed: false,
      type: ['recommendation', 'conversion_opportunity', 'follow_up_reminder'],
    });

    return insights.map(insight => ({
      id: insight.id,
      title: insight.title,
      description: insight.description,
      priority: insight.priority,
      actionType: insight.action_type,
      actionLabel: this.getActionLabel(insight.action_type),
      actionUrl: insight.action_url,
      impact: this.getImpactDescription(insight),
    }));
  }

  /**
   * Get key trends
   */
  static async getTrends(institutionId: string): Promise<TrendData[]> {
    const insights = await this.getInsights({
      institution_id: institutionId,
      is_dismissed: false,
      type: ['trend_insight'],
    });

    return insights.map(insight => ({
      label: insight.metric_label || insight.title,
      current: insight.metric_value || 0,
      previous: insight.metric_value && insight.metric_change
        ? insight.metric_value - (insight.metric_value * insight.metric_change / 100)
        : 0,
      change: insight.metric_change || 0,
      changePercent: insight.metric_change || 0,
      direction: insight.metric_change
        ? insight.metric_change > 0 ? 'up' : insight.metric_change < 0 ? 'down' : 'stable'
        : 'stable',
    }));
  }

  /**
   * Get anomalies
   */
  static async getAnomalies(institutionId: string): Promise<Anomaly[]> {
    const insights = await this.getInsights({
      institution_id: institutionId,
      is_dismissed: false,
      type: ['anomaly_detection', 'engagement_alert'],
    });

    return insights.map(insight => ({
      id: insight.id,
      title: insight.title,
      description: insight.description,
      severity: insight.priority,
      metric: insight.metric_label || 'Unknown metric',
      expected: 0, // Would need baseline data
      actual: insight.metric_value || 0,
      deviation: insight.metric_change || 0,
    }));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private static getActionLabel(actionType: InsightAction): string {
    const labels: Record<InsightAction, string> = {
      contact_lead: 'Contact Leads',
      schedule_followup: 'Schedule Follow-ups',
      send_campaign: 'Send Campaign',
      assign_counselor: 'Assign Counselor',
      review_leads: 'Review Leads',
      update_strategy: 'Update Strategy',
      view_report: 'View Report',
      no_action: 'No Action',
    };
    return labels[actionType] || 'Take Action';
  }

  private static getImpactDescription(insight: AIInsight): string {
    if (insight.related_lead_ids.length > 0) {
      return `Affects ${insight.related_lead_ids.length} lead(s)`;
    }
    if (insight.metric_value) {
      return `${insight.metric_label}: ${insight.metric_value}`;
    }
    return 'Potential improvement opportunity';
  }
}
