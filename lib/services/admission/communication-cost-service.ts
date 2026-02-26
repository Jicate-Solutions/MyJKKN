// lib/services/admission/communication-cost-service.ts
// Communication Cost Tracking Service
// Log costs per channel, monthly summaries, and budget tracking

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export type CostChannel = 'email' | 'sms' | 'whatsapp' | 'call' | 'voice_broadcast';
export type CostEventType = 'send' | 'receive' | 'call_minute' | 'template_message';

export interface CommunicationCostEntry {
  id: string;
  institution_id: string;
  channel: CostChannel;
  event_type: CostEventType;
  unit_cost: number;
  quantity: number;
  total_cost: number;
  currency: string;
  reference_id: string | null;
  created_at: string;
}

export interface LogCostInput {
  institution_id: string;
  channel: CostChannel;
  event_type: CostEventType;
  unit_cost: number;
  quantity?: number;
  currency?: string;
  reference_id?: string;
}

export interface CostFilters {
  institutionId: string;
  channel?: CostChannel;
  eventType?: CostEventType;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface MonthlyCostSummary {
  month: string;
  channel: CostChannel;
  total_cost: number;
  total_units: number;
  avg_unit_cost: number;
}

export interface ChannelCostSummary {
  channel: CostChannel;
  total_cost: number;
  total_units: number;
  avg_unit_cost: number;
  percentage_of_total: number;
}

export interface CostDashboard {
  total_spend: number;
  monthly_spend: number;
  daily_average: number;
  by_channel: ChannelCostSummary[];
  monthly_trend: MonthlyCostSummary[];
  top_cost_items: CommunicationCostEntry[];
}

// Default unit costs per channel (INR)
const DEFAULT_UNIT_COSTS: Record<CostChannel, Record<CostEventType, number>> = {
  email: { send: 0.001, receive: 0, call_minute: 0, template_message: 0 },
  sms: { send: 0.18, receive: 0, call_minute: 0, template_message: 0 },
  whatsapp: { send: 0, receive: 0, call_minute: 0, template_message: 0.50 },
  call: { send: 0, receive: 0, call_minute: 1.50, template_message: 0 },
  voice_broadcast: { send: 0.75, receive: 0, call_minute: 1.50, template_message: 0 },
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class CommunicationCostService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // COST LOGGING
  // ============================================================================

  /**
   * Log a communication cost entry
   */
  static async logCost(input: LogCostInput): Promise<CommunicationCostEntry> {
    const quantity = input.quantity || 1;
    const totalCost = input.unit_cost * quantity;

    const { data, error } = await (this.supabase as any)
      .from('communication_cost_log')
      .insert({
        institution_id: input.institution_id,
        channel: input.channel,
        event_type: input.event_type,
        unit_cost: input.unit_cost,
        quantity,
        total_cost: totalCost,
        currency: input.currency || 'INR',
        reference_id: input.reference_id || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to log cost: ${error.message}`);
    return data as CommunicationCostEntry;
  }

  /**
   * Log cost using default unit costs
   */
  static async logDefaultCost(params: {
    institutionId: string;
    channel: CostChannel;
    eventType: CostEventType;
    quantity?: number;
    referenceId?: string;
  }): Promise<CommunicationCostEntry> {
    const unitCost = DEFAULT_UNIT_COSTS[params.channel]?.[params.eventType] || 0;

    return this.logCost({
      institution_id: params.institutionId,
      channel: params.channel,
      event_type: params.eventType,
      unit_cost: unitCost,
      quantity: params.quantity,
      reference_id: params.referenceId,
    });
  }

  // ============================================================================
  // COST QUERIES
  // ============================================================================

  /**
   * Get cost entries with filters
   */
  static async getCosts(filters: CostFilters): Promise<{
    entries: CommunicationCostEntry[];
    total: number;
  }> {
    let query = (this.supabase as any)
      .from('communication_cost_log')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institutionId)
      .order('created_at', { ascending: false });

    if (filters.channel) query = query.eq('channel', filters.channel);
    if (filters.eventType) query = query.eq('event_type', filters.eventType);
    if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
    if (filters.toDate) query = query.lte('created_at', filters.toDate);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch costs: ${error.message}`);

    return {
      entries: (data || []) as CommunicationCostEntry[],
      total: count || 0,
    };
  }

  /**
   * Get total spend for an institution
   */
  static async getTotalSpend(params: {
    institutionId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<number> {
    let query = (this.supabase as any)
      .from('communication_cost_log')
      .select('total_cost')
      .eq('institution_id', params.institutionId);

    if (params.fromDate) query = query.gte('created_at', params.fromDate);
    if (params.toDate) query = query.lte('created_at', params.toDate);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch total spend: ${error.message}`);

    return (data || []).reduce((sum: number, entry: any) => sum + (Number(entry.total_cost) || 0), 0);
  }

  // ============================================================================
  // SUMMARIES & DASHBOARD
  // ============================================================================

  /**
   * Get monthly cost summary
   */
  static async getMonthlySummary(params: {
    institutionId: string;
    months?: number;
  }): Promise<MonthlyCostSummary[]> {
    const monthsBack = params.months || 12;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);

    const { data, error } = await (this.supabase as any)
      .from('communication_cost_log')
      .select('channel, total_cost, quantity, created_at')
      .eq('institution_id', params.institutionId)
      .gte('created_at', startDate.toISOString());

    if (error) throw new Error(`Failed to fetch monthly summary: ${error.message}`);

    // Group by month and channel
    const monthlyMap = new Map<string, Map<CostChannel, { cost: number; units: number }>>();

    for (const entry of (data || [])) {
      const month = entry.created_at.substring(0, 7); // YYYY-MM
      if (!monthlyMap.has(month)) monthlyMap.set(month, new Map());
      const channelMap = monthlyMap.get(month)!;
      const channel = entry.channel as CostChannel;
      if (!channelMap.has(channel)) channelMap.set(channel, { cost: 0, units: 0 });
      const current = channelMap.get(channel)!;
      current.cost += Number(entry.total_cost) || 0;
      current.units += Number(entry.quantity) || 0;
    }

    const summaries: MonthlyCostSummary[] = [];
    for (const [month, channelMap] of monthlyMap) {
      for (const [channel, data] of channelMap) {
        summaries.push({
          month,
          channel,
          total_cost: data.cost,
          total_units: data.units,
          avg_unit_cost: data.units > 0 ? data.cost / data.units : 0,
        });
      }
    }

    return summaries.sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Get channel cost breakdown
   */
  static async getChannelBreakdown(params: {
    institutionId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ChannelCostSummary[]> {
    let query = (this.supabase as any)
      .from('communication_cost_log')
      .select('channel, total_cost, quantity')
      .eq('institution_id', params.institutionId);

    if (params.fromDate) query = query.gte('created_at', params.fromDate);
    if (params.toDate) query = query.lte('created_at', params.toDate);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch channel breakdown: ${error.message}`);

    const channelMap = new Map<CostChannel, { cost: number; units: number }>();
    let totalCost = 0;

    for (const entry of (data || [])) {
      const channel = entry.channel as CostChannel;
      if (!channelMap.has(channel)) channelMap.set(channel, { cost: 0, units: 0 });
      const current = channelMap.get(channel)!;
      current.cost += Number(entry.total_cost) || 0;
      current.units += Number(entry.quantity) || 0;
      totalCost += Number(entry.total_cost) || 0;
    }

    return Array.from(channelMap.entries()).map(([channel, data]) => ({
      channel,
      total_cost: data.cost,
      total_units: data.units,
      avg_unit_cost: data.units > 0 ? data.cost / data.units : 0,
      percentage_of_total: totalCost > 0 ? (data.cost / totalCost) * 100 : 0,
    })).sort((a, b) => b.total_cost - a.total_cost);
  }

  /**
   * Get full cost dashboard data
   */
  static async getDashboard(institutionId: string): Promise<CostDashboard> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [totalSpend, monthlySpend, channelBreakdown, monthlyTrend, recentCosts] = await Promise.all([
      this.getTotalSpend({ institutionId }),
      this.getTotalSpend({ institutionId, fromDate: monthStart }),
      this.getChannelBreakdown({ institutionId }),
      this.getMonthlySummary({ institutionId, months: 6 }),
      this.getCosts({ institutionId, limit: 10 }),
    ]);

    // Calculate daily average (last 30 days)
    const last30DaysSpend = await this.getTotalSpend({
      institutionId,
      fromDate: thirtyDaysAgo,
    });

    return {
      total_spend: totalSpend,
      monthly_spend: monthlySpend,
      daily_average: last30DaysSpend / 30,
      by_channel: channelBreakdown,
      monthly_trend: monthlyTrend,
      top_cost_items: recentCosts.entries,
    };
  }

  // ============================================================================
  // UNIT COSTS MANAGEMENT
  // ============================================================================

  /**
   * Get default unit costs
   */
  static getDefaultUnitCosts(): Record<CostChannel, Record<CostEventType, number>> {
    return { ...DEFAULT_UNIT_COSTS };
  }

  /**
   * Get channel labels
   */
  static getChannelLabels(): Record<CostChannel, string> {
    return {
      email: 'Email',
      sms: 'SMS',
      whatsapp: 'WhatsApp',
      call: 'Phone Call',
      voice_broadcast: 'Voice Broadcast',
    };
  }
}
