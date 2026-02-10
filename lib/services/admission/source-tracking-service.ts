// lib/services/admission/source-tracking-service.ts
// Service for lead source attribution and ROI analysis

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface SourceSummary {
  source: string;
  leads: number;
  conversions: number;
  conversionRate: number;
}

export interface SourceStats {
  totalLeads: number;
  totalSources: number;
  attributedLeads: number;
  attributionRate: number;
  topSource: string;
}

export class SourceTrackingService {
  static async getSourceBreakdown(institutionId: string): Promise<SourceSummary[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_leads')
      .select('source, funnel_stage')
      .eq('institution_id', institutionId);

    if (error) throw error;

    const sourceMap = new Map<string, { leads: number; conversions: number }>();

    for (const lead of data || []) {
      const src = lead.source || 'Unknown';
      if (!sourceMap.has(src)) sourceMap.set(src, { leads: 0, conversions: 0 });
      const entry = sourceMap.get(src)!;
      entry.leads++;
      // Count conversions (enrolled stage)
      if (lead.funnel_stage === 'enrolled' || lead.funnel_stage === 'confirmed') {
        entry.conversions++;
      }
    }

    return Array.from(sourceMap.entries())
      .map(([source, stats]) => ({
        source,
        leads: stats.leads,
        conversions: stats.conversions,
        conversionRate: stats.leads > 0 ? Math.round((stats.conversions / stats.leads) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.leads - a.leads);
  }

  static async getSourceStats(institutionId: string): Promise<SourceStats> {
    const breakdown = await this.getSourceBreakdown(institutionId);
    const totalLeads = breakdown.reduce((sum, s) => sum + s.leads, 0);
    const attributed = breakdown.filter(s => s.source !== 'Unknown').reduce((sum, s) => sum + s.leads, 0);

    return {
      totalLeads,
      totalSources: breakdown.filter(s => s.source !== 'Unknown').length,
      attributedLeads: attributed,
      attributionRate: totalLeads > 0 ? Math.round((attributed / totalLeads) * 1000) / 10 : 0,
      topSource: breakdown.length > 0 ? breakdown[0].source : 'N/A',
    };
  }
}
