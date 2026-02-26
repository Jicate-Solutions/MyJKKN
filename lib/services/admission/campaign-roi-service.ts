// lib/services/admission/campaign-roi-service.ts
// Campaign ROI Attribution Service
// Tracks every communication campaign from send -> open -> application -> enrollment with cost metrics

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export type AttributionChannel = 'email' | 'sms' | 'whatsapp' | 'call';

export interface CampaignROIData {
  campaign_id: string;
  campaign_name: string;
  institution_id: string;
  channel: AttributionChannel;
  campaign_date: string;
  // Funnel metrics
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_replied: number;
  applications: number;
  enrollments: number;
  // Rates
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  application_rate: number;
  enrollment_rate: number;
  // Cost metrics
  total_cost: number;
  cost_per_lead: number;
  cost_per_application: number;
  cost_per_enrollment: number;
  // ROI
  revenue_generated: number;
  roi_percentage: number;
}

export interface ChannelComparison {
  channel: AttributionChannel;
  total_campaigns: number;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  applications: number;
  enrollments: number;
  total_cost: number;
  avg_delivery_rate: number;
  avg_open_rate: number;
  avg_click_rate: number;
  avg_conversion_rate: number;
  cost_per_lead: number;
  cost_per_enrollment: number;
}

export interface ConversionFunnelStep {
  step: string;
  count: number;
  rate: number;
  drop_off: number;
}

export interface ROIFilters {
  institutionId: string;
  channel?: AttributionChannel;
  fromDate?: string;
  toDate?: string;
  campaignId?: string;
  limit?: number;
  offset?: number;
}

export interface ROISummary {
  total_campaigns: number;
  total_spent: number;
  total_leads_generated: number;
  total_applications: number;
  total_enrollments: number;
  overall_roi: number;
  avg_cost_per_lead: number;
  avg_cost_per_enrollment: number;
  best_performing_channel: AttributionChannel | null;
}

// Attribution window in days
const ATTRIBUTION_WINDOW_DAYS = 7;

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class CampaignROIService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // CAMPAIGN ROI DATA
  // ============================================================================

  /**
   * Get ROI data for all campaigns
   */
  static async getCampaignROI(filters: ROIFilters): Promise<{
    campaigns: CampaignROIData[];
    total: number;
  }> {
    // Query campaign queue with aggregated metrics
    let query = (this.supabase as any)
      .from('admission_campaign_queue')
      .select(`
        id,
        institution_id,
        step_type,
        status,
        metadata,
        created_at,
        updated_at
      `, { count: 'exact' })
      .eq('institution_id', filters.institutionId)
      .in('status', ['completed', 'sent', 'active'])
      .order('created_at', { ascending: false });

    if (filters.channel) {
      const stepType = filters.channel === 'email' ? 'send_email'
        : filters.channel === 'sms' ? 'send_sms'
        : filters.channel === 'whatsapp' ? 'send_whatsapp'
        : 'make_call';
      query = query.eq('step_type', stepType);
    }
    if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
    if (filters.toDate) query = query.lte('created_at', filters.toDate);
    if (filters.campaignId) query = query.eq('id', filters.campaignId);

    const limit = filters.limit || 20;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data: campaigns, count, error } = await query;
    if (error) throw new Error(`Failed to fetch campaign ROI: ${error.message}`);

    // For each campaign, fetch aggregated metrics
    const campaignROIData: CampaignROIData[] = await Promise.all(
      (campaigns || []).map(async (campaign: any) => {
        const metrics = await this.getCampaignMetrics(campaign.id, campaign.step_type, filters.institutionId);
        const channel = this.stepTypeToChannel(campaign.step_type);

        const totalSent = metrics.sent || 0;
        const totalDelivered = metrics.delivered || 0;
        const totalOpened = metrics.opened || 0;
        const totalClicked = metrics.clicked || 0;
        const applications = metrics.applications || 0;
        const enrollments = metrics.enrollments || 0;
        const totalCost = metrics.totalCost || 0;

        return {
          campaign_id: campaign.id,
          campaign_name: campaign.metadata?.name || `Campaign ${campaign.id.slice(0, 8)}`,
          institution_id: campaign.institution_id,
          channel,
          campaign_date: campaign.created_at,
          total_sent: totalSent,
          total_delivered: totalDelivered,
          total_opened: totalOpened,
          total_clicked: totalClicked,
          total_replied: metrics.replied || 0,
          applications,
          enrollments,
          delivery_rate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
          open_rate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
          click_rate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
          application_rate: totalSent > 0 ? (applications / totalSent) * 100 : 0,
          enrollment_rate: totalSent > 0 ? (enrollments / totalSent) * 100 : 0,
          total_cost: totalCost,
          cost_per_lead: totalSent > 0 ? totalCost / totalSent : 0,
          cost_per_application: applications > 0 ? totalCost / applications : 0,
          cost_per_enrollment: enrollments > 0 ? totalCost / enrollments : 0,
          revenue_generated: metrics.revenue || 0,
          roi_percentage: totalCost > 0 ? ((metrics.revenue || 0) - totalCost) / totalCost * 100 : 0,
        };
      })
    );

    return {
      campaigns: campaignROIData,
      total: count || 0,
    };
  }

  /**
   * Get aggregated metrics for a specific campaign
   */
  private static async getCampaignMetrics(
    campaignId: string,
    stepType: string,
    institutionId: string
  ): Promise<{
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    applications: number;
    enrollments: number;
    totalCost: number;
    revenue: number;
  }> {
    const metrics = {
      sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0,
      applications: 0, enrollments: 0, totalCost: 0, revenue: 0,
    };

    try {
      // Fetch channel-specific metrics
      if (stepType === 'send_email') {
        const { data: emailLogs } = await (this.supabase as any)
          .from('admission_email_logs')
          .select('status')
          .eq('campaign_id', campaignId);

        if (emailLogs) {
          metrics.sent = emailLogs.filter((l: any) => l.status !== 'failed').length;
          metrics.delivered = emailLogs.filter((l: any) => ['delivered', 'opened', 'clicked'].includes(l.status)).length;
          metrics.opened = emailLogs.filter((l: any) => ['opened', 'clicked'].includes(l.status)).length;
          metrics.clicked = emailLogs.filter((l: any) => l.status === 'clicked').length;
        }
      } else if (stepType === 'send_sms') {
        const { data: smsLogs } = await (this.supabase as any)
          .from('admission_sms_logs')
          .select('status')
          .eq('campaign_id', campaignId);

        if (smsLogs) {
          metrics.sent = smsLogs.filter((l: any) => l.status !== 'failed').length;
          metrics.delivered = smsLogs.filter((l: any) => l.status === 'delivered').length;
        }
      } else if (stepType === 'send_whatsapp') {
        const { data: waLogs } = await (this.supabase as any)
          .from('admission_whatsapp_campaign_logs')
          .select('delivery_status')
          .eq('campaign_id', campaignId);

        if (waLogs) {
          metrics.sent = waLogs.filter((l: any) => l.delivery_status !== 'failed').length;
          metrics.delivered = waLogs.filter((l: any) => ['delivered', 'read'].includes(l.delivery_status)).length;
          metrics.opened = waLogs.filter((l: any) => l.delivery_status === 'read').length;
        }
      }

      // Get attributed applications (within attribution window)
      const { data: applications } = await (this.supabase as any)
        .from('admission_applications')
        .select('id, lead_id')
        .eq('attributed_campaign_id', campaignId);

      metrics.applications = (applications || []).length;

      // Get enrolled count from attributed applications
      if (applications && applications.length > 0) {
        const leadIds = applications.map((a: any) => a.lead_id).filter(Boolean);
        if (leadIds.length > 0) {
          const { data: enrolledLeads } = await (this.supabase as any)
            .from('admission_leads')
            .select('id')
            .in('id', leadIds)
            .eq('stage', 'enrolled');

          metrics.enrollments = (enrolledLeads || []).length;
        }
      }

      // Get costs from communication_cost_log
      const { data: costs } = await (this.supabase as any)
        .from('communication_cost_log')
        .select('total_cost')
        .eq('reference_id', campaignId);

      if (costs) {
        metrics.totalCost = costs.reduce((sum: number, c: any) => sum + (Number(c.total_cost) || 0), 0);
      }
    } catch (err) {
      console.error(`[campaign-roi] Error fetching metrics for campaign ${campaignId}:`, err);
    }

    return metrics;
  }

  // ============================================================================
  // CHANNEL COMPARISON
  // ============================================================================

  /**
   * Get channel-level comparison
   */
  static async getChannelComparison(filters: {
    institutionId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ChannelComparison[]> {
    const channels: AttributionChannel[] = ['email', 'sms', 'whatsapp', 'call'];
    const comparisons: ChannelComparison[] = [];

    for (const channel of channels) {
      const { campaigns } = await this.getCampaignROI({
        institutionId: filters.institutionId,
        channel,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        limit: 1000,
      });

      if (campaigns.length === 0) continue;

      const totalSent = campaigns.reduce((s, c) => s + c.total_sent, 0);
      const totalDelivered = campaigns.reduce((s, c) => s + c.total_delivered, 0);
      const totalOpened = campaigns.reduce((s, c) => s + c.total_opened, 0);
      const totalClicked = campaigns.reduce((s, c) => s + c.total_clicked, 0);
      const applications = campaigns.reduce((s, c) => s + c.applications, 0);
      const enrollments = campaigns.reduce((s, c) => s + c.enrollments, 0);
      const totalCost = campaigns.reduce((s, c) => s + c.total_cost, 0);

      comparisons.push({
        channel,
        total_campaigns: campaigns.length,
        total_sent: totalSent,
        total_delivered: totalDelivered,
        total_opened: totalOpened,
        total_clicked: totalClicked,
        applications,
        enrollments,
        total_cost: totalCost,
        avg_delivery_rate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
        avg_open_rate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
        avg_click_rate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
        avg_conversion_rate: totalSent > 0 ? (enrollments / totalSent) * 100 : 0,
        cost_per_lead: totalSent > 0 ? totalCost / totalSent : 0,
        cost_per_enrollment: enrollments > 0 ? totalCost / enrollments : 0,
      });
    }

    return comparisons;
  }

  // ============================================================================
  // ROI SUMMARY
  // ============================================================================

  /**
   * Get overall ROI summary
   */
  static async getROISummary(filters: {
    institutionId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ROISummary> {
    const channelData = await this.getChannelComparison(filters);

    const totalCampaigns = channelData.reduce((s, c) => s + c.total_campaigns, 0);
    const totalSpent = channelData.reduce((s, c) => s + c.total_cost, 0);
    const totalLeads = channelData.reduce((s, c) => s + c.total_sent, 0);
    const totalApplications = channelData.reduce((s, c) => s + c.applications, 0);
    const totalEnrollments = channelData.reduce((s, c) => s + c.enrollments, 0);

    // Find best performing channel by conversion rate
    let bestChannel: AttributionChannel | null = null;
    let bestRate = 0;
    for (const ch of channelData) {
      if (ch.avg_conversion_rate > bestRate) {
        bestRate = ch.avg_conversion_rate;
        bestChannel = ch.channel;
      }
    }

    return {
      total_campaigns: totalCampaigns,
      total_spent: totalSpent,
      total_leads_generated: totalLeads,
      total_applications: totalApplications,
      total_enrollments: totalEnrollments,
      overall_roi: totalSpent > 0 ? ((totalEnrollments * 50000 - totalSpent) / totalSpent) * 100 : 0,
      avg_cost_per_lead: totalLeads > 0 ? totalSpent / totalLeads : 0,
      avg_cost_per_enrollment: totalEnrollments > 0 ? totalSpent / totalEnrollments : 0,
      best_performing_channel: bestChannel,
    };
  }

  // ============================================================================
  // CONVERSION FUNNEL
  // ============================================================================

  /**
   * Get conversion funnel for a campaign
   */
  static async getConversionFunnel(campaignId: string): Promise<ConversionFunnelStep[]> {
    const { campaigns } = await this.getCampaignROI({
      institutionId: '', // Not needed for single campaign
      campaignId,
      limit: 1,
    });

    if (campaigns.length === 0) return [];

    const campaign = campaigns[0];
    const steps: ConversionFunnelStep[] = [
      { step: 'Sent', count: campaign.total_sent, rate: 100, drop_off: 0 },
      {
        step: 'Delivered',
        count: campaign.total_delivered,
        rate: campaign.delivery_rate,
        drop_off: 100 - campaign.delivery_rate,
      },
      {
        step: 'Opened',
        count: campaign.total_opened,
        rate: campaign.open_rate,
        drop_off: campaign.delivery_rate - campaign.open_rate,
      },
      {
        step: 'Clicked',
        count: campaign.total_clicked,
        rate: campaign.click_rate,
        drop_off: campaign.open_rate - campaign.click_rate,
      },
      {
        step: 'Applied',
        count: campaign.applications,
        rate: campaign.application_rate,
        drop_off: campaign.click_rate - campaign.application_rate,
      },
      {
        step: 'Enrolled',
        count: campaign.enrollments,
        rate: campaign.enrollment_rate,
        drop_off: campaign.application_rate - campaign.enrollment_rate,
      },
    ];

    return steps;
  }

  // ============================================================================
  // ATTRIBUTION
  // ============================================================================

  /**
   * Attribute an action to a campaign using first-touch attribution
   * Called when a lead takes an action (application, payment) within the attribution window
   */
  static async attributeAction(params: {
    leadId: string;
    actionType: 'application' | 'payment' | 'enrollment';
    actionId: string;
    institutionId: string;
  }): Promise<{ campaignId: string | null; channel: AttributionChannel | null }> {
    const windowDate = new Date();
    windowDate.setDate(windowDate.getDate() - ATTRIBUTION_WINDOW_DAYS);

    // Find the most recent campaign message sent to this lead within the attribution window
    // Check email logs first, then SMS, then WhatsApp
    const tables = [
      { table: 'admission_email_logs', idField: 'lead_id', dateField: 'created_at', channel: 'email' as const },
      { table: 'admission_sms_logs', idField: 'lead_id', dateField: 'created_at', channel: 'sms' as const },
      { table: 'admission_whatsapp_campaign_logs', idField: 'lead_id', dateField: 'created_at', channel: 'whatsapp' as const },
    ];

    for (const { table, idField, dateField, channel } of tables) {
      const { data } = await (this.supabase as any)
        .from(table)
        .select('campaign_id, created_at')
        .eq(idField, params.leadId)
        .not('campaign_id', 'is', null)
        .gte(dateField, windowDate.toISOString())
        .order(dateField, { ascending: false })
        .limit(1);

      if (data && data.length > 0 && data[0].campaign_id) {
        // Update the application with attribution
        if (params.actionType === 'application') {
          await (this.supabase as any)
            .from('admission_applications')
            .update({
              attributed_campaign_id: data[0].campaign_id,
              attribution_channel: channel,
              attribution_timestamp: new Date().toISOString(),
            })
            .eq('id', params.actionId);
        }

        return { campaignId: data[0].campaign_id, channel };
      }
    }

    return { campaignId: null, channel: null };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private static stepTypeToChannel(stepType: string): AttributionChannel {
    switch (stepType) {
      case 'send_email': return 'email';
      case 'send_sms': return 'sms';
      case 'send_whatsapp': return 'whatsapp';
      case 'make_call': return 'call';
      default: return 'email';
    }
  }
}
