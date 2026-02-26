// lib/services/admission/admission-tqm-metrics-service.ts
// Computes TQM metrics from admission data for the Process Excellence dashboard widget
// Uses the admission_process_metrics view and billing_copq_incidents table

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface AdmissionTQMMetrics {
  // Current month metrics
  current: MonthlyMetrics;
  // Previous month metrics (for delta calculation)
  previous: MonthlyMetrics | null;
  // COPQ summary
  copq: COPQSummary;
}

export interface MonthlyMetrics {
  month: string;
  total_leads: number;
  enrolled_count: number;
  avg_cycle_time_hours: number | null;
  avg_first_response_hours: number | null;
  first_contact_sla_pct: number | null;
  lost_rate_pct: number | null;
  conversion_rate_pct: number | null;
}

export interface COPQSummary {
  total_incidents: number;
  total_visible_cost: number;
  total_hidden_cost: number;
  top_categories: { category: string; count: number; cost: number }[];
}

// ============================================================================
// SERVICE
// ============================================================================

export class AdmissionTQMMetricsService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get TQM metrics for admission quality widget
   * Fetches current + previous month from the admission_process_metrics view
   * and COPQ incidents from billing_copq_incidents
   */
  static async getMetrics(institutionId: string): Promise<AdmissionTQMMetrics> {
    if (!institutionId) throw new Error('Institution ID is required');

    // Fetch metrics from the view (last 2 months)
    // Using 'as any' because Supabase views may not be in the typed .from() overload
    const { data: metricsData, error: metricsError } = await (this.supabase as any)
      .from('admission_process_metrics')
      .select('*')
      .eq('institution_id', institutionId)
      .order('month', { ascending: false })
      .limit(2);

    if (metricsError) {
      console.error('[admission/tqm] Failed to fetch metrics:', metricsError);
      throw metricsError;
    }

    // Parse current and previous month
    const rows = (metricsData || []) as Record<string, unknown>[];
    const current: MonthlyMetrics = rows[0]
      ? this.parseRow(rows[0])
      : this.emptyMonth();
    const previous: MonthlyMetrics | null = rows[1]
      ? this.parseRow(rows[1])
      : null;

    // Fetch COPQ incidents for current month (admission-related)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: copqData, error: copqError } = await (this.supabase as any)
      .from('billing_copq_incidents')
      .select('category, visible_cost, hidden_cost_estimate')
      .eq('institution_id', institutionId)
      .gte('created_at', startOfMonth.toISOString());

    if (copqError) {
      console.error('[admission/tqm] Failed to fetch COPQ:', copqError);
    }

    // Aggregate COPQ
    const copqRows = (copqData || []) as { category: string; visible_cost: number; hidden_cost_estimate: number }[];
    const copq = this.aggregateCOPQ(copqRows);

    return { current, previous, copq };
  }

  /**
   * Get stage-level duration breakdown for bottleneck analysis
   */
  static async getStageDurations(institutionId: string): Promise<{
    stage: string;
    avg_hours: number;
    lead_count: number;
  }[]> {
    if (!institutionId) return [];

    const { data, error } = await (this.supabase as any).rpc(
      'get_admission_stage_durations',
      { p_institution_id: institutionId }
    );

    if (error) {
      // RPC may not exist yet - return empty
      console.warn('[admission/tqm] Stage durations RPC not available:', error.message);
      return [];
    }

    return data || [];
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private static parseRow(row: Record<string, unknown>): MonthlyMetrics {
    return {
      month: String(row.month || ''),
      total_leads: Number(row.total_leads) || 0,
      enrolled_count: Number(row.enrolled_count) || 0,
      avg_cycle_time_hours: row.avg_cycle_time_hours != null
        ? Number(row.avg_cycle_time_hours)
        : null,
      avg_first_response_hours: row.avg_first_response_hours != null
        ? Number(row.avg_first_response_hours)
        : null,
      first_contact_sla_pct: row.first_contact_sla_pct != null
        ? Number(row.first_contact_sla_pct)
        : null,
      lost_rate_pct: row.lost_rate_pct != null
        ? Number(row.lost_rate_pct)
        : null,
      conversion_rate_pct: row.conversion_rate_pct != null
        ? Number(row.conversion_rate_pct)
        : null,
    };
  }

  private static emptyMonth(): MonthlyMetrics {
    return {
      month: new Date().toISOString(),
      total_leads: 0,
      enrolled_count: 0,
      avg_cycle_time_hours: null,
      avg_first_response_hours: null,
      first_contact_sla_pct: null,
      lost_rate_pct: null,
      conversion_rate_pct: null,
    };
  }

  private static aggregateCOPQ(
    rows: { category: string; visible_cost: number; hidden_cost_estimate: number }[]
  ): COPQSummary {
    if (rows.length === 0) {
      return {
        total_incidents: 0,
        total_visible_cost: 0,
        total_hidden_cost: 0,
        top_categories: [],
      };
    }

    let totalVisible = 0;
    let totalHidden = 0;
    const catMap = new Map<string, { count: number; cost: number }>();

    for (const row of rows) {
      const v = Number(row.visible_cost) || 0;
      const h = Number(row.hidden_cost_estimate) || 0;
      totalVisible += v;
      totalHidden += h;

      const existing = catMap.get(row.category) || { count: 0, cost: 0 };
      existing.count += 1;
      existing.cost += v + h;
      catMap.set(row.category, existing);
    }

    const top_categories = Array.from(catMap.entries())
      .map(([category, { count, cost }]) => ({ category, count, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 3);

    return {
      total_incidents: rows.length,
      total_visible_cost: totalVisible,
      total_hidden_cost: totalHidden,
      top_categories,
    };
  }
}
