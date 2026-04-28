// lib/services/admission/group-dashboard-service.ts
// Cross-institution admission metrics and group-level analytics

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  GroupDashboardData,
  InstitutionAdmissionSummary,
  SeatAnalyticsRow,
  SeatPivotRow,
  SourceAnalyticsRow,
  GeographyAnalyticsRow,
  InstitutionComparisonRow,
} from '@/types/admission-workflow-config';

const EMPTY_GROUP_DASHBOARD: GroupDashboardData = {
  institutions: [],
  totals: {
    total_leads: 0,
    total_applied: 0,
    total_enrolled: 0,
    total_rejected: 0,
    total_seats: 0,
    overall_fill_percentage: 0,
  },
};

export class GroupDashboardService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get admission summary across the institutions the user has access to.
   * Backed by fn_group_dashboard_overview RPC (added 2026-04-28).
   *
   * @param institutionIds  scope; pass undefined for all-accessible (RLS-enforced)
   * @param admissionYearId strict-mode filter on the admission_year UUID
   * @param programStartYear pragmatic-mode filter (used when admission_year_id is sparse)
   *
   * If both year args are null/undefined the RPC returns all-time totals — the
   * Overview tab UI always passes programStartYear (defaulted to the latest cohort).
   */
  static async getGroupDashboard(
    institutionIds?: string[],
    admissionYearId?: string | null,
    programStartYear?: number | null
  ): Promise<GroupDashboardData> {
    if (institutionIds !== undefined && institutionIds.length === 0) {
      return EMPTY_GROUP_DASHBOARD;
    }

    // RPC requires a non-null institution array. If caller didn't scope (super-admin),
    // resolve all accessible institutions first via RLS-respecting select.
    let resolvedInstitutionIds = institutionIds;
    if (resolvedInstitutionIds === undefined) {
      const { data: insts, error: instErr } = await (this.supabase as any)
        .from('institutions')
        .select('id');
      if (instErr) {
        console.error('[admission/group] Failed to resolve institutions:', instErr);
        throw instErr;
      }
      resolvedInstitutionIds = ((insts ?? []) as Array<{ id: string }>).map((i) => i.id);
      if (resolvedInstitutionIds.length === 0) return EMPTY_GROUP_DASHBOARD;
    }

    const { data, error } = await (this.supabase as any).rpc('fn_group_dashboard_overview', {
      p_institution_ids: resolvedInstitutionIds,
      p_admission_year_id: admissionYearId ?? null,
      p_program_start_year: programStartYear ?? null,
    });

    if (error) {
      console.error('[admission/group] fn_group_dashboard_overview failed:', error);
      throw error;
    }

    type Row = {
      institution_id: string;
      institution_name: string;
      total_leads: number;
      active_crm_leads: number;
      lost_leads: number;
      applied_learners: number;
      active_learners: number;
      rejected_learners: number;
      total_seats: number;
      filled_seats: number;
      fill_percentage: number;
    };

    const rows = ((data ?? []) as Row[]).map((r): InstitutionAdmissionSummary => ({
      institution_id: r.institution_id,
      institution_name: r.institution_name,
      total_leads: Number(r.total_leads),
      active_crm_leads: Number(r.active_crm_leads),
      lost_leads: Number(r.lost_leads),
      applied: Number(r.applied_learners),
      enrolled: Number(r.active_learners),
      rejected: Number(r.rejected_learners),
      total_seats: Number(r.total_seats),
      filled_seats: Number(r.filled_seats),
      fill_percentage: Number(r.fill_percentage),
    }));

    rows.sort((a, b) => b.enrolled - a.enrolled);

    const totals = rows.reduce(
      (acc, s) => ({
        total_leads: acc.total_leads + s.total_leads,
        total_applied: acc.total_applied + s.applied,
        total_enrolled: acc.total_enrolled + s.enrolled,
        total_rejected: acc.total_rejected + s.rejected,
        total_seats: acc.total_seats + s.total_seats,
        overall_fill_percentage: 0,
      }),
      { total_leads: 0, total_applied: 0, total_enrolled: 0, total_rejected: 0, total_seats: 0, overall_fill_percentage: 0 }
    );
    totals.overall_fill_percentage =
      totals.total_seats > 0
        ? Math.round((totals.total_enrolled / totals.total_seats) * 100)
        : 0;

    return { institutions: rows, totals };
  }

  static async getSeatAnalytics(
    institutionId?: string
  ): Promise<SeatAnalyticsRow[]> {
    const { data, error } = await (this.supabase as any).rpc('get_seat_analytics', {
      p_institution_id: institutionId ?? null,
    });
    if (error) {
      console.error('[admission/group] get_seat_analytics failed:', error);
      throw error;
    }
    return (data ?? []) as SeatAnalyticsRow[];
  }

  /**
   * Daily admission pivot — one row per (institution, program) for a given
   * admission_year, with daily_counts JSONB keyed by IST date.
   * Backed by fn_seat_analytics_daily_pivot (added 2026-04-28).
   *
   * @param institutionIds  scope; undefined => all-accessible (super-admin path)
   * @param admissionYear   integer cohort, e.g. 2026
   */
  static async getSeatDailyPivot(
    institutionIds: string[] | undefined,
    admissionYear: number,
    excludeBulkMigrated = false
  ): Promise<SeatPivotRow[]> {
    // The RPC requires a non-null institution array. For super-admins (undefined)
    // we resolve all RLS-accessible institutions first (same pattern as
    // getGroupDashboard). For scoped users with explicit empty array, short-circuit.
    let resolvedInstitutionIds = institutionIds;
    if (resolvedInstitutionIds === undefined) {
      const { data: insts, error: instErr } = await (this.supabase as any)
        .from('institutions')
        .select('id');
      if (instErr) {
        console.error('[admission/group] Failed to resolve institutions for pivot:', instErr);
        throw instErr;
      }
      resolvedInstitutionIds = ((insts ?? []) as Array<{ id: string }>).map((i) => i.id);
    }
    if (resolvedInstitutionIds.length === 0) return [];

    const { data, error } = await (this.supabase as any).rpc('fn_seat_analytics_daily_pivot', {
      p_institution_ids: resolvedInstitutionIds,
      p_admission_year: admissionYear,
      p_exclude_bulk_migrated: excludeBulkMigrated,
    });
    if (error) {
      console.error('[admission/group] fn_seat_analytics_daily_pivot failed:', error);
      throw error;
    }
    // Coerce numeric strings (Postgres NUMERIC arrives as string in JS)
    return ((data ?? []) as any[]).map((r): SeatPivotRow => ({
      ...r,
      intake: Number(r.intake),
      filled: Number(r.filled),
      balance: Number(r.balance),
      fill_percentage: Number(r.fill_percentage),
      daily_counts: (r.daily_counts ?? {}) as Record<string, number>,
    }));
  }

  /**
   * AY-scoped source breakdown. Backed by fn_source_analytics RPC.
   * Replaces the legacy get_source_analytics(uuid, uuid) — which used the
   * sparse academic_year_id FK and lacked role_has_institution_access().
   *
   * @param institutionIds  scope; undefined => super-admin all-accessible
   * @param admissionYear   cohort year integer (e.g. 2026); null => all-time
   */
  static async getSourceAnalytics(
    institutionIds: string[] | undefined,
    admissionYear: number | null
  ): Promise<SourceAnalyticsRow[]> {
    let resolved = institutionIds;
    if (resolved === undefined) {
      const { data: insts, error: instErr } = await (this.supabase as any)
        .from('institutions')
        .select('id');
      if (instErr) {
        console.error('[admission/group] Failed to resolve institutions for sources:', instErr);
        throw instErr;
      }
      resolved = ((insts ?? []) as Array<{ id: string }>).map((i) => i.id);
    }
    if (resolved.length === 0) return [];

    const { data, error } = await (this.supabase as any).rpc('fn_source_analytics', {
      p_institution_ids: resolved,
      p_admission_year: admissionYear ?? null,
    });
    if (error) {
      console.error('[admission/group] fn_source_analytics failed:', error);
      throw error;
    }
    return ((data ?? []) as any[]).map((r): SourceAnalyticsRow => ({
      ...r,
      lead_count: Number(r.lead_count),
      enrolled_count: Number(r.enrolled_count),
      conversion_rate: Number(r.conversion_rate),
    }));
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

  static async getInstitutionComparison(): Promise<InstitutionComparisonRow[]> {
    const [seatRows, sourceRows, geoRows] = await Promise.all([
      this.getSeatAnalytics(),
      this.getSourceAnalytics(),
      this.getGeographyAnalytics(),
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

}
