// lib/services/admission/group-dashboard-service.ts
// Cross-institution admission metrics and group-level analytics

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  GroupDashboardData,
  InstitutionAdmissionSummary,
  CrossCampusDuplicate,
  SeatAnalyticsRow,
  SourceAnalyticsRow,
  GeographyAnalyticsRow,
  InstitutionComparisonRow,
} from '@/types/admission-workflow-config';

export class GroupDashboardService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get admission summary across the institutions the user has access to.
   * When `institutionIds` is provided, the query is explicitly scoped to those IDs.
   * When undefined, callers must be global users — RLS on `institutions` enforces scope.
   */
  static async getGroupDashboard(institutionIds?: string[]): Promise<GroupDashboardData> {
    let instQuery = this.supabase
      .from('institutions')
      .select('id, name');

    if (institutionIds !== undefined) {
      if (institutionIds.length === 0) {
        return {
          institutions: [],
          totals: {
            total_leads: 0,
            total_applied: 0,
            total_enrolled: 0,
            total_seats: 0,
            overall_fill_percentage: 0,
          },
        };
      }
      instQuery = instQuery.in('id', institutionIds);
    }

    const { data: institutions, error: instError } = await instQuery;

    if (instError) {
      console.error('[admission/group] Failed to fetch institutions:', instError);
      throw instError;
    }

    if (!institutions || institutions.length === 0) {
      return {
        institutions: [],
        totals: {
          total_leads: 0,
          total_applied: 0,
          total_enrolled: 0,
          total_seats: 0,
          overall_fill_percentage: 0,
        },
      };
    }

    const resolvedInstitutionIds = institutions.map((i) => i.id);

    // Get lead counts per institution per stage
    const { data: leadsData, error: leadsError } = await (this.supabase as any)
      .from('admission_leads')
      .select('institution_id, funnel_stage')
      .in('institution_id', resolvedInstitutionIds);

    if (leadsError) {
      console.error('[admission/group] Failed to fetch leads:', leadsError);
      throw leadsError;
    }

    // Get seat configs
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${(currentYear + 1).toString().slice(2)}`;

    const { data: seatData } = await (this.supabase as any)
      .from('institution_seat_config')
      .select('institution_id, total_seats')
      .in('institution_id', resolvedInstitutionIds)
      .eq('academic_year', academicYear);

    // Aggregate by institution
    const leadsByInst = new Map<string, { total: number; applied: number; enrolled: number }>();
    for (const lead of (leadsData || []) as { institution_id: string; funnel_stage: string }[]) {
      const current = leadsByInst.get(lead.institution_id) || { total: 0, applied: 0, enrolled: 0 };
      current.total += 1;
      if (['application_submitted', 'documents_pending', 'documents_verified',
        'interview_scheduled', 'interview_completed', 'offer_sent',
        'offer_accepted', 'token_paid', 'enrolled'].includes(lead.funnel_stage)) {
        current.applied += 1;
      }
      if (lead.funnel_stage === 'enrolled') {
        current.enrolled += 1;
      }
      leadsByInst.set(lead.institution_id, current);
    }

    const seatsByInst = new Map<string, number>();
    for (const seat of (seatData || []) as { institution_id: string; total_seats: number }[]) {
      const existing = seatsByInst.get(seat.institution_id) || 0;
      seatsByInst.set(seat.institution_id, existing + seat.total_seats);
    }

    // Build summaries
    const summaries: InstitutionAdmissionSummary[] = institutions.map((inst) => {
      const leads = leadsByInst.get(inst.id) || { total: 0, applied: 0, enrolled: 0 };
      const seats = seatsByInst.get(inst.id) || 0;
      return {
        institution_id: inst.id,
        institution_name: inst.name,
        total_leads: leads.total,
        applied: leads.applied,
        enrolled: leads.enrolled,
        total_seats: seats,
        fill_percentage: seats > 0 ? Math.round((leads.enrolled / seats) * 100) : 0,
      };
    });

    // Sort by enrolled descending
    summaries.sort((a, b) => b.enrolled - a.enrolled);

    // Calculate totals
    const totals = summaries.reduce(
      (acc, s) => ({
        total_leads: acc.total_leads + s.total_leads,
        total_applied: acc.total_applied + s.applied,
        total_enrolled: acc.total_enrolled + s.enrolled,
        total_seats: acc.total_seats + s.total_seats,
        overall_fill_percentage: 0,
      }),
      { total_leads: 0, total_applied: 0, total_enrolled: 0, total_seats: 0, overall_fill_percentage: 0 }
    );
    totals.overall_fill_percentage =
      totals.total_seats > 0
        ? Math.round((totals.total_enrolled / totals.total_seats) * 100)
        : 0;

    return { institutions: summaries, totals };
  }

  /**
   * Find cross-campus duplicate leads
   */
  static async findCrossCampusDuplicates(): Promise<CrossCampusDuplicate[]> {
    const { data, error } = await (this.supabase as any).rpc(
      'find_cross_campus_duplicates'
    );

    if (error) {
      // RPC may not exist - fall back to client-side query
      console.warn('[admission/group] Cross-campus dedup RPC not available, using fallback');
      return this.findDuplicatesFallback();
    }

    return (data || []) as CrossCampusDuplicate[];
  }

  static async getSeatAnalytics(
    institutionId?: string,
    academicYearId?: string
  ): Promise<SeatAnalyticsRow[]> {
    const { data, error } = await (this.supabase as any).rpc('get_seat_analytics', {
      p_institution_id: institutionId ?? null,
      p_academic_year_id: academicYearId ?? null,
    });
    if (error) {
      console.error('[admission/group] get_seat_analytics failed:', error);
      throw error;
    }
    return (data ?? []) as SeatAnalyticsRow[];
  }

  static async getSourceAnalytics(
    institutionId?: string,
    academicYearId?: string
  ): Promise<SourceAnalyticsRow[]> {
    const { data, error } = await (this.supabase as any).rpc('get_source_analytics', {
      p_institution_id: institutionId ?? null,
      p_academic_year_id: academicYearId ?? null,
    });
    if (error) {
      console.error('[admission/group] get_source_analytics failed:', error);
      throw error;
    }
    return (data ?? []) as SourceAnalyticsRow[];
  }

  static async getGeographyAnalytics(
    institutionId?: string,
    academicYearId?: string
  ): Promise<GeographyAnalyticsRow[]> {
    const { data, error } = await (this.supabase as any).rpc('get_geography_analytics', {
      p_institution_id: institutionId ?? null,
      p_academic_year_id: academicYearId ?? null,
    });
    if (error) {
      console.error('[admission/group] get_geography_analytics failed:', error);
      throw error;
    }
    return (data ?? []) as GeographyAnalyticsRow[];
  }

  static async getInstitutionComparison(
    academicYearId?: string
  ): Promise<InstitutionComparisonRow[]> {
    const [seatRows, sourceRows, geoRows] = await Promise.all([
      this.getSeatAnalytics(undefined, academicYearId),
      this.getSourceAnalytics(undefined, academicYearId),
      this.getGeographyAnalytics(undefined, academicYearId),
    ]);

    // Aggregate seat data per institution
    const seatMap = new Map<string, { name: string; total_seats: number; filled_seats: number }>();
    for (const r of seatRows) {
      const cur = seatMap.get(r.institution_id) ?? { name: r.institution_name, total_seats: 0, filled_seats: 0 };
      cur.total_seats += r.total_seats;
      cur.filled_seats += Number(r.filled_seats);
      seatMap.set(r.institution_id, cur);
    }

    // Aggregate source data per institution
    const sourceMap = new Map<string, { total_leads: number; enrolled: number; sourceCounts: Map<string, number> }>();
    for (const r of sourceRows) {
      const cur = sourceMap.get(r.institution_id) ?? { total_leads: 0, enrolled: 0, sourceCounts: new Map() };
      cur.total_leads += Number(r.lead_count);
      cur.enrolled += Number(r.enrolled_count);
      const src = r.source ?? 'unknown';
      cur.sourceCounts.set(src, (cur.sourceCounts.get(src) ?? 0) + Number(r.enrolled_count));
      sourceMap.set(r.institution_id, cur);
    }

    // Top district per institution
    const districtMap = new Map<string, { district: string; count: number }>();
    for (const r of geoRows) {
      if (!r.district) continue;
      const cur = districtMap.get(r.institution_id);
      if (!cur || Number(r.active_learners) > cur.count) {
        districtMap.set(r.institution_id, { district: r.district, count: Number(r.active_learners) });
      }
    }

    // Total active learners per institution from geography data
    const activeMap = new Map<string, number>();
    for (const r of geoRows) {
      activeMap.set(r.institution_id, (activeMap.get(r.institution_id) ?? 0) + Number(r.active_learners));
    }

    const rows: InstitutionComparisonRow[] = [];
    for (const [instId, seat] of seatMap) {
      const src = sourceMap.get(instId);
      const topSrcEntry = src
        ? [...src.sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0]
        : undefined;
      rows.push({
        institution_id: instId,
        institution_name: seat.name,
        total_seats: seat.total_seats,
        filled_seats: seat.filled_seats,
        fill_percentage: seat.total_seats > 0
          ? Math.round((seat.filled_seats / seat.total_seats) * 100)
          : 0,
        total_leads: src?.total_leads ?? 0,
        enrolled_count: src?.enrolled ?? 0,
        conversion_rate: src && src.total_leads > 0
          ? Math.round((src.enrolled / src.total_leads) * 100 * 10) / 10
          : 0,
        top_source: topSrcEntry?.[0] ?? null,
        top_district: districtMap.get(instId)?.district ?? null,
        active_learners: activeMap.get(instId) ?? 0,
      });
    }

    return rows.sort((a, b) => b.fill_percentage - a.fill_percentage);
  }

  private static async findDuplicatesFallback(): Promise<CrossCampusDuplicate[]> {
    // Simple fallback: find leads with same phone across institutions
    const { data, error } = await (this.supabase as any)
      .from('admission_leads')
      .select('id, institution_id, full_name, phone, email, funnel_stage')
      .not('funnel_stage', 'in', '("enrolled","lost")')
      .not('phone', 'is', null)
      .order('phone');

    if (error || !data) return [];

    const leads = data as {
      id: string;
      institution_id: string;
      full_name: string;
      phone: string;
      email: string | null;
      funnel_stage: string;
    }[];

    // Group by phone and find cross-institution matches
    const phoneMap = new Map<string, typeof leads>();
    for (const lead of leads) {
      if (!lead.phone) continue;
      const existing = phoneMap.get(lead.phone) || [];
      existing.push(lead);
      phoneMap.set(lead.phone, existing);
    }

    const duplicates: CrossCampusDuplicate[] = [];
    for (const [, group] of phoneMap) {
      if (group.length < 2) continue;
      // Check cross-institution
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (group[i].institution_id !== group[j].institution_id) {
            duplicates.push({
              lead_1_id: group[i].id,
              institution_1: group[i].institution_id,
              institution_1_name: '',
              lead_2_id: group[j].id,
              institution_2: group[j].institution_id,
              institution_2_name: '',
              full_name: group[i].full_name,
              phone: group[i].phone,
              confidence: group[i].email === group[j].email ? 1.0 : 0.9,
            });
          }
        }
      }
    }

    return duplicates.sort((a, b) => b.confidence - a.confidence);
  }
}
