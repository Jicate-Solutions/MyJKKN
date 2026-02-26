// WhatsApp Template Analytics Service
// Per-template engagement analytics aggregated from admission_whatsapp_logs
// Gap 7 — No migration needed, queries existing tables

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface TemplateAnalytics {
  template_id: string;
  template_name: string;
  category: string | null;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  delivery_rate: number;
  read_rate: number;
  fail_rate: number;
  quality_rating: string | null;
}

export interface DailyMetric {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

// =============================================================================
// Service
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class WhatsAppTemplateAnalyticsService {
  /**
   * Get per-template analytics for an institution
   * Aggregates from admission_whatsapp_logs grouped by template_id
   * JOINs admission_communication_templates for name + category
   */
  static async getTemplateAnalytics(
    institutionId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<TemplateAnalytics[]> {
    const supabase = getServiceClient();

    // Fetch all whatsapp logs with template_id for this institution
    let query = supabase
      .from('admission_whatsapp_logs')
      .select('template_id, delivery_status, created_at')
      .eq('institution_id', institutionId)
      .not('template_id', 'is', null);

    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const { data: logs, error: logsError } = await query;
    if (logsError) throw new Error(`Failed to fetch logs: ${logsError.message}`);

    if (!logs || logs.length === 0) return [];

    // Get unique template IDs
    const templateIds = [...new Set(logs.map((l: { template_id: string }) => l.template_id))];

    // Fetch template metadata
    const { data: templates, error: templatesError } = await supabase
      .from('admission_communication_templates')
      .select('id, name, category')
      .in('id', templateIds);

    if (templatesError) throw new Error(`Failed to fetch templates: ${templatesError.message}`);

    const templateMap = new Map<string, { name: string; category: string | null }>();
    for (const t of templates || []) {
      templateMap.set(t.id, { name: t.name, category: t.category });
    }

    // Aggregate per template
    const aggregated = new Map<string, {
      sent: number; delivered: number; read: number; failed: number;
    }>();

    for (const log of logs) {
      const tid = log.template_id as string;
      if (!aggregated.has(tid)) {
        aggregated.set(tid, { sent: 0, delivered: 0, read: 0, failed: 0 });
      }
      const agg = aggregated.get(tid)!;
      agg.sent++;
      const status = log.delivery_status as string;
      if (status === 'delivered') agg.delivered++;
      else if (status === 'read') { agg.delivered++; agg.read++; }
      else if (status === 'failed') agg.failed++;
      // 'sent' and 'pending' only count toward sent
    }

    // Build result array
    const results: TemplateAnalytics[] = [];
    for (const [templateId, counts] of aggregated) {
      const meta = templateMap.get(templateId);
      results.push({
        template_id: templateId,
        template_name: meta?.name || 'Unknown Template',
        category: meta?.category || null,
        sent_count: counts.sent,
        delivered_count: counts.delivered,
        read_count: counts.read,
        failed_count: counts.failed,
        delivery_rate: counts.sent > 0 ? Math.round((counts.delivered / counts.sent) * 1000) / 10 : 0,
        read_rate: counts.delivered > 0 ? Math.round((counts.read / counts.delivered) * 1000) / 10 : 0,
        fail_rate: counts.sent > 0 ? Math.round((counts.failed / counts.sent) * 1000) / 10 : 0,
        quality_rating: null, // Populated separately from Meta API if available
      });
    }

    // Sort by sent_count DESC
    results.sort((a, b) => b.sent_count - a.sent_count);
    return results;
  }

  /**
   * Get daily timeline for a specific template
   */
  static async getTemplateTimeline(
    templateId: string,
    institutionId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<DailyMetric[]> {
    const supabase = getServiceClient();

    const { data: logs, error } = await supabase
      .from('admission_whatsapp_logs')
      .select('delivery_status, created_at')
      .eq('institution_id', institutionId)
      .eq('template_id', templateId)
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch timeline: ${error.message}`);

    // Group by date
    const dailyMap = new Map<string, { sent: number; delivered: number; read: number; failed: number }>();

    for (const log of logs || []) {
      const date = (log.created_at as string).substring(0, 10); // YYYY-MM-DD
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { sent: 0, delivered: 0, read: 0, failed: 0 });
      }
      const day = dailyMap.get(date)!;
      day.sent++;
      const status = log.delivery_status as string;
      if (status === 'delivered') day.delivered++;
      else if (status === 'read') { day.delivered++; day.read++; }
      else if (status === 'failed') day.failed++;
    }

    // Fill in all dates in range
    const result: DailyMetric[] = [];
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().substring(0, 10);
      const counts = dailyMap.get(dateStr) || { sent: 0, delivered: 0, read: 0, failed: 0 };
      result.push({ date: dateStr, ...counts });
    }

    return result;
  }

  /**
   * Get top performing templates by read rate
   * Minimum 10 sends to qualify
   */
  static async getTopPerformingTemplates(
    institutionId: string,
    limit: number = 5
  ): Promise<TemplateAnalytics[]> {
    const analytics = await this.getTemplateAnalytics(institutionId);
    return analytics
      .filter((a) => a.sent_count >= 10)
      .sort((a, b) => b.read_rate - a.read_rate)
      .slice(0, limit);
  }

  /**
   * Get worst performing templates by delivery rate
   * Minimum 10 sends to qualify
   */
  static async getWorstPerformingTemplates(
    institutionId: string,
    limit: number = 5
  ): Promise<TemplateAnalytics[]> {
    const analytics = await this.getTemplateAnalytics(institutionId);
    return analytics
      .filter((a) => a.sent_count >= 10)
      .sort((a, b) => a.delivery_rate - b.delivery_rate)
      .slice(0, limit);
  }
}
