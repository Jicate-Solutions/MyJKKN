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
  AdmittedSourceRow,
  AdmittedSourceCount,
  AdmittedSourcePage,
} from '@/types/admission-workflow-config';

const EMPTY_GROUP_DASHBOARD: GroupDashboardData = {
  institutions: [],
  totals: {
    total_leads: 0,
    total_applied: 0,
    total_enrolled: 0,
    total_rejected: 0,
    total_seats: 0,
    total_filled: 0,
    total_enrolled_leads: 0,
    total_seat_filled_learners: 0,
    overall_fill_percentage: 0,
    total_enquiry: 0,
    total_enquiry_submitted: 0,
    total_account: 0,
    total_reserved: 0,
    total_admitted: 0,
    total_rejected_lifecycle: 0,
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
    programStartYear?: number | null,
    // 2026-05-21: optional date-range filter (IST). NULL on both sides
    // preserves prior behaviour. Drives the Overview tab's
    // "All time / Today / Custom range" segmented toggle.
    fromDate?: string | null,
    toDate?: string | null
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
      p_from_date: fromDate ?? null,
      p_to_date: toDate ?? null,
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
      // 2026-05-17 (E4): RPC now returns lead-space + learner-space "filled"
      // side-by-side. enrolled_leads === filled_seats during the rollout window;
      // seat_filled_learners is the new learner-space count from the dynamic
      // admission_statuses catalog.
      enrolled_leads: number;
      seat_filled_learners: number;
      fill_percentage: number;
      // 2026-05-20: lifecycle-status counts from the workflow realignment.
      enquiry_count: number;
      enquiry_submitted_count: number;
      account_count: number;
      reserved_count: number;
      admitted_count: number;            // = 'admitted' + 'active' per spec
      rejected_lifecycle_count: number;
    };

    // 2026-06-17: The Group Dashboard overview shows only 'institution' and
    // 'school' entity types (in separate sections); 'company' / 'admin_office'
    // are excluded group-wide. The RPC doesn't return entity_type, so resolve
    // it here with a tiny RLS-scoped lookup and filter the rows below. Totals
    // are then summed over the filtered set, so the header KPI strip excludes
    // the non-academic entities too.
    const OVERVIEW_ENTITY_TYPES = new Set(['institution', 'school']);
    const rpcRows = (data ?? []) as Row[];
    const entityTypeById = new Map<string, string>();
    if (rpcRows.length > 0) {
      const { data: entityRows, error: entityErr } = await (this.supabase as any)
        .from('institutions')
        .select('id, entity_type')
        .in('id', rpcRows.map((r) => r.institution_id));
      if (entityErr) {
        console.error('[admission/group] Failed to resolve entity types:', entityErr);
        throw entityErr;
      }
      for (const e of (entityRows ?? []) as Array<{ id: string; entity_type: string | null }>) {
        entityTypeById.set(e.id, e.entity_type ?? '');
      }
    }

    const rows = rpcRows.map((r): InstitutionAdmissionSummary => ({
      institution_id: r.institution_id,
      institution_name: r.institution_name,
      entity_type: entityTypeById.get(r.institution_id) ?? '',
      total_leads: Number(r.total_leads),
      active_crm_leads: Number(r.active_crm_leads),
      lost_leads: Number(r.lost_leads),
      applied: Number(r.applied_learners),
      enrolled: Number(r.active_learners),
      rejected: Number(r.rejected_learners),
      total_seats: Number(r.total_seats),
      filled_seats: Number(r.filled_seats),
      enrolled_leads: Number(r.enrolled_leads ?? r.filled_seats ?? 0),
      seat_filled_learners: Number(r.seat_filled_learners ?? 0),
      fill_percentage: Number(r.fill_percentage),
      enquiry_count: Number(r.enquiry_count ?? 0),
      enquiry_submitted_count: Number(r.enquiry_submitted_count ?? 0),
      account_count: Number(r.account_count ?? 0),
      reserved_count: Number(r.reserved_count ?? 0),
      admitted_count: Number(r.admitted_count ?? 0),
      rejected_lifecycle_count: Number(r.rejected_lifecycle_count ?? 0),
    })).filter((r) => OVERVIEW_ENTITY_TYPES.has(r.entity_type));

    // 2026-05-20: Sort by admitted (lifecycle) rather than legacy funnel-stage
    // 'enrolled' so the comparison table ranks institutions by the new
    // workflow's success metric.
    rows.sort((a, b) => b.admitted_count - a.admitted_count);

    // 2026-05-02: Fill Rate uses total_filled (admitted+active+graduated+account)
    // not total_enrolled (active only) — otherwise top card disagrees with the
    // Seat Analytics > Summary tab which shares the same definition.
    // 2026-05-17 (E4): also aggregate enrolled_leads (lead-space) and
    // seat_filled_learners (learner-space) so the dashboard can render the
    // dual-KPI split for the "Filled" card.
    const totals = rows.reduce(
      (acc, s) => ({
        total_leads: acc.total_leads + s.total_leads,
        total_applied: acc.total_applied + s.applied,
        total_enrolled: acc.total_enrolled + s.enrolled,
        total_rejected: acc.total_rejected + s.rejected,
        total_seats: acc.total_seats + s.total_seats,
        total_filled: acc.total_filled + s.filled_seats,
        total_enrolled_leads: acc.total_enrolled_leads + s.enrolled_leads,
        total_seat_filled_learners:
          acc.total_seat_filled_learners + s.seat_filled_learners,
        overall_fill_percentage: 0,
        // 2026-05-20: lifecycle-status totals — the primary source for
        // the dashboard's top KPI strip and all-tab analytics.
        total_enquiry: acc.total_enquiry + s.enquiry_count,
        total_enquiry_submitted:
          acc.total_enquiry_submitted + s.enquiry_submitted_count,
        total_account: acc.total_account + s.account_count,
        total_reserved: acc.total_reserved + s.reserved_count,
        total_admitted: acc.total_admitted + s.admitted_count,
        total_rejected_lifecycle:
          acc.total_rejected_lifecycle + s.rejected_lifecycle_count,
      }),
      {
        total_leads: 0, total_applied: 0, total_enrolled: 0,
        total_rejected: 0, total_seats: 0, total_filled: 0,
        total_enrolled_leads: 0, total_seat_filled_learners: 0,
        overall_fill_percentage: 0,
        total_enquiry: 0, total_enquiry_submitted: 0, total_account: 0,
        total_reserved: 0, total_admitted: 0, total_rejected_lifecycle: 0,
      }
    );
    totals.overall_fill_percentage =
      totals.total_seats > 0
        ? Math.round((totals.total_filled / totals.total_seats) * 100)
        : 0;

    return { institutions: rows, totals };
  }

  /**
   * Seat fill stats per cohort. Backed by get_seat_analytics RPC.
   *
   * @param institutionId    optional institution filter; null = all-accessible
   * @param programStartYear optional cohort year (e.g. 2026); null = active cohorts only
   */
  static async getSeatAnalytics(
    institutionId?: string,
    programStartYear?: number | null
  ): Promise<SeatAnalyticsRow[]> {
    const { data, error } = await (this.supabase as any).rpc('get_seat_analytics', {
      p_institution_id: institutionId ?? null,
      p_program_start_year: programStartYear ?? null,
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
      reserved: Number(r.reserved),
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

  /**
   * Resolve the institution scope for an analytics RPC.
   *
   * `undefined` means "super-admin, all institutions" — the caller has no
   * explicit scope, so we list every institution the browser client can read
   * and let the RPC's own role_has_institution_access() gate do the filtering.
   * `[]` means "scoped user with no access" and short-circuits to no query.
   */
  private static async resolveInstitutionScope(
    institutionIds: string[] | undefined,
    label: string
  ): Promise<string[]> {
    if (institutionIds !== undefined) return institutionIds;
    const { data, error } = await (this.supabase as any)
      .from('institutions')
      .select('id');
    if (error) {
      console.error(`[admission/group] Failed to resolve institutions for ${label}:`, error);
      throw error;
    }
    return ((data ?? []) as Array<{ id: string }>).map((i) => i.id);
  }

  /**
   * Admitted learners with the source they came from — the drill-down behind
   * the "Admitted" KPI. Backed by fn_admitted_source_breakdown.
   *
   * Anchored on learners_profiles (NOT admission_leads), so the total here
   * always equals the KPI that was clicked. Learners with no lead row come
   * back with source === null and are filterable via DIRECT_SOURCE_KEY.
   *
   * Pagination is server-side: the RPC returns `total_count` as a window
   * count on every row, so there is no second count query. (A `count: 'exact'`
   * companion query over this shape is an unbounded scan paid twice and a
   * known source of 57014 timeouts in this codebase.)
   */
  static async getAdmittedSourceBreakdown(
    institutionIds: string[] | undefined,
    admissionYear: number | null,
    source: string | null,
    limit: number,
    offset: number
  ): Promise<AdmittedSourcePage> {
    const resolved = await this.resolveInstitutionScope(institutionIds, 'admitted-sources');
    if (resolved.length === 0) return { rows: [], totalCount: 0 };

    const { data, error } = await (this.supabase as any).rpc('fn_admitted_source_breakdown', {
      p_institution_ids: resolved,
      p_admission_year: admissionYear ?? null,
      p_source: source ?? null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) {
      console.error('[admission/group] fn_admitted_source_breakdown failed:', error);
      throw error;
    }

    const raw = (data ?? []) as any[];
    return {
      rows: raw.map((r): AdmittedSourceRow => ({
        learner_id: r.learner_id,
        full_name: r.full_name ?? null,
        application_id: r.application_id ?? null,
        roll_number: r.roll_number ?? null,
        student_mobile: r.student_mobile ?? null,
        father_mobile: r.father_mobile ?? null,
        mother_mobile: r.mother_mobile ?? null,
        institution_id: r.institution_id,
        institution_name: r.institution_name,
        program_name: r.program_name ?? null,
        source: r.source ?? null,
        referral_type: r.referral_type ?? null,
        referred_by_name: r.referred_by_name ?? null,
        admitted_at: r.admitted_at ?? null,
        created_at: r.created_at ?? null,
      })),
      // Zero rows means zero matches — the window count only exists on a row.
      totalCount: raw.length > 0 ? Number(raw[0].total_count) : 0,
    };
  }

  /**
   * Per-source admitted counts for the drill-down's filter chips and donut.
   * Backed by fn_admitted_source_counts. Separate from the list RPC so the
   * chips don't have to page the whole result set.
   *
   * The '__direct__' bucket (DIRECT_SOURCE_KEY) is a real, first-class value
   * here — it is the count of admitted learners with no lead row, which for
   * AY 2026 is 64% of the cohort.
   */
  static async getAdmittedSourceCounts(
    institutionIds: string[] | undefined,
    admissionYear: number | null
  ): Promise<AdmittedSourceCount[]> {
    const resolved = await this.resolveInstitutionScope(institutionIds, 'admitted-source-counts');
    if (resolved.length === 0) return [];

    const { data, error } = await (this.supabase as any).rpc('fn_admitted_source_counts', {
      p_institution_ids: resolved,
      p_admission_year: admissionYear ?? null,
    });
    if (error) {
      console.error('[admission/group] fn_admitted_source_counts failed:', error);
      throw error;
    }
    return ((data ?? []) as any[]).map((r): AdmittedSourceCount => ({
      source: r.source,
      admits: Number(r.admits),
    }));
  }

  /**
   * AY-scoped geographic distribution. Backed by fn_geography_analytics.
   * Replaces legacy get_geography_analytics(uuid, uuid).
   */
  static async getGeographyAnalytics(
    institutionIds: string[] | undefined,
    admissionYear: number | null
  ): Promise<GeographyAnalyticsRow[]> {
    let resolved = institutionIds;
    if (resolved === undefined) {
      const { data: insts, error: instErr } = await (this.supabase as any)
        .from('institutions')
        .select('id');
      if (instErr) {
        console.error('[admission/group] Failed to resolve institutions for geography:', instErr);
        throw instErr;
      }
      resolved = ((insts ?? []) as Array<{ id: string }>).map((i) => i.id);
    }
    if (resolved.length === 0) return [];

    const { data, error } = await (this.supabase as any).rpc('fn_geography_analytics', {
      p_institution_ids: resolved,
      p_admission_year: admissionYear ?? null,
    });
    if (error) {
      console.error('[admission/group] fn_geography_analytics failed:', error);
      throw error;
    }
    return ((data ?? []) as any[]).map((r): GeographyAnalyticsRow => ({
      ...r,
      active_learners: Number(r.active_learners),
    }));
  }

  /**
   * Institution-level comparison metrics. Backed by fn_institution_comparison
   * RPC (added 2026-04-28) which produces one row per institution with
   * funnel-correct, internally-consistent semantics — replacing the legacy
   * client-side 3-way fan-out that mixed inconsistent lifecycle_status sets.
   */
  static async getInstitutionComparison(
    institutionIds: string[] | undefined,
    admissionYear: number | null
  ): Promise<InstitutionComparisonRow[]> {
    let resolved = institutionIds;
    if (resolved === undefined) {
      const { data: insts, error: instErr } = await (this.supabase as any)
        .from('institutions')
        .select('id');
      if (instErr) {
        console.error('[admission/group] Failed to resolve institutions for comparison:', instErr);
        throw instErr;
      }
      resolved = ((insts ?? []) as Array<{ id: string }>).map((i) => i.id);
    }
    if (resolved.length === 0) return [];

    const { data, error } = await (this.supabase as any).rpc('fn_institution_comparison', {
      p_institution_ids: resolved,
      p_admission_year: admissionYear ?? null,
    });
    if (error) {
      console.error('[admission/group] fn_institution_comparison failed:', error);
      throw error;
    }
    return ((data ?? []) as any[]).map((r): InstitutionComparisonRow => ({
      ...r,
      total_seats: Number(r.total_seats),
      filled_seats: Number(r.filled_seats),
      fill_percentage: Number(r.fill_percentage),
      total_leads: Number(r.total_leads),
      enrolled_count: Number(r.enrolled_count),
      conversion_rate: Number(r.conversion_rate),
      active_learners: Number(r.active_learners),
    }));
  }

}
