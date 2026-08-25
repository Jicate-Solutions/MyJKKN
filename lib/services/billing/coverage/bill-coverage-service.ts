import { BaseService } from '@/lib/services/base-service';
import type {
  BillCoverageFilters,
  BillCoverageRow,
  BillCoverageSummary,
  CoverageLearnerBillRow
} from '@/types/billing-coverage';
import { LEARNER_SCOPE_DEFAULT } from '@/types/billing-coverage';

// ============================================================================
// BILL COVERAGE SERVICE
// ============================================================================
// Thin wrapper over two SECURITY DEFINER RPCs (migration 20260725). All
// scoping, permission gating and the learner-vs-bill anti-join happen in
// Postgres; this layer only marshals params and strips the RPC's out_ column
// prefix.
//
// The out_ prefix exists because a RETURNS TABLE column named institution_id
// collides with the real column and raises 42702 in this schema.
// ============================================================================

interface RawCoverageRow {
  out_learner_id: string;
  out_roll_number: string | null;
  out_register_number: string | null;
  out_full_name: string;
  out_lifecycle_status: string;
  out_gender: string | null;
  out_institution_id: string;
  out_institution_name: string | null;
  out_program_name: string | null;
  out_semester_section: string | null;
  out_academic_year_id: string | null;
  out_academic_year_name: string | null;
  out_admission_year: number | null;
  out_accommodation_type: string | null;
  out_uses_transport: boolean | null;
  out_bill_count: number;
  out_total_billed: number | string;
  out_total_paid: number | string;
  out_coverage_state: string;
  out_target_academic_year_name: string | null;
  out_program_duration_yrs: number | string | null;
  out_programme_end_year: string | null;
  out_total_count: number | string;
}

export class BillCoverageService extends BaseService {
  /** Empty selections become null so the RPC falls back to the caller's full
   *  accessible scope. Uses ?? rather than || — undefined must never be passed
   *  through as a real parameter value. */
  private static baseParams(filters: BillCoverageFilters) {
    return {
      // Null is meaningful, not merely "unset": the RPC resolves each
      // institution's current academic year by date. Do NOT default this to a
      // year client-side — the page spans institutions whose current year can
      // differ, and one guessed year would mismeasure the rest.
      p_academic_year_id: filters.academic_year_id ?? null,
      // The opposite kind of parameter to the one above: this one selects which
      // LEARNERS are in scope, not which year they are measured against. An
      // integer cohort year, so it works across institutions — admission_years
      // has one row per institution per year.
      p_admission_year: filters.admission_year ?? null,
      p_institution_ids:
        filters.institution_ids && filters.institution_ids.length > 0
          ? filters.institution_ids
          : null,
      p_lifecycle_statuses:
        filters.lifecycle_statuses && filters.lifecycle_statuses.length > 0
          ? filters.lifecycle_statuses
          : [...LEARNER_SCOPE_DEFAULT],
      p_billing_category_id: filters.billing_category_id ?? null,
      p_include_non_billing_institutions:
        filters.include_non_billing_institutions ?? false,
      p_accommodation_type_ids:
        filters.accommodation_type_ids && filters.accommodation_type_ids.length > 0
          ? filters.accommodation_type_ids
          : null,
      // Transport is a separate dimension from accommodation — the two compose.
      p_transport: filters.transport ?? 'any',
      // null = any gender. GENDER_UNSET selects learners with a blank gender.
      p_gender: filters.gender ?? null,
      // Academic hierarchy. Set here in baseParams, which feeds BOTH the summary
      // and the learners query — putting them only on the learners call would
      // leave the KPI cards counting a wider population than the table shows.
      // `??` not `||`: '' would flow through as a real uuid parameter and match
      // zero rows.
      p_degree_id: filters.degree_id ?? null,
      p_department_id: filters.department_id ?? null,
      p_program_id: filters.program_id ?? null,
      p_semester_id: filters.semester_id ?? null,
      p_section_id: filters.section_id ?? null
    };
  }

  /**
   * Per-learner, per-bill detail for the PDF export.
   *
   * Deliberately NOT paginated the way the table is: the PDF covers the whole
   * filtered set, capped server-side (default 1,000 learners, hard max 5,000) so
   * a broad filter cannot try to render tens of thousands of learners. Callers
   * should tell the user when the cap bites — `learnerCount` is the true total
   * BEFORE the cap, so `learnerCount > returned learners` means truncation.
   */
  static async getLearnerBills(
    filters: BillCoverageFilters = {},
    maxLearners = 1000
  ): Promise<{ rows: CoverageLearnerBillRow[]; learnerCount: number }> {
    const raw = await this.executeDashboardRPC<Array<Record<string, any>>>(
      'get_billing_coverage_learner_bills',
      {
        ...this.baseParams(filters),
        // The detail RPC has no p_sort_by/p_page; it orders by institution →
        // roll number → due date so the document reads in a stable order.
        p_coverage_state: filters.coverage_state ?? 'all',
        p_search: filters.search ?? null,
        p_max_learners: maxLearners
      }
    );

    const list = raw ?? [];
    const rows: CoverageLearnerBillRow[] = list.map((r) => ({
      learner_id: r.out_learner_id,
      roll_number: r.out_roll_number,
      register_number: r.out_register_number,
      full_name: r.out_full_name,
      institution_name: r.out_institution_name,
      program_name: r.out_program_name,
      semester_section: r.out_semester_section,
      lifecycle_status: r.out_lifecycle_status,
      learner_total: Number(r.out_learner_total ?? 0),
      learner_paid: Number(r.out_learner_paid ?? 0),
      learner_pending: Number(r.out_learner_pending ?? 0),
      bill_id: r.out_bill_id,
      bill_description: r.out_bill_description,
      category_name: r.out_category_name,
      bill_academic_year: r.out_bill_academic_year,
      due_date: r.out_due_date,
      bill_status: r.out_bill_status,
      total_amount: r.out_total_amount == null ? null : Number(r.out_total_amount),
      paid_amount: r.out_paid_amount == null ? null : Number(r.out_paid_amount),
      pending_amount:
        r.out_pending_amount == null ? null : Number(r.out_pending_amount)
    }));

    return {
      rows,
      learnerCount: Number(list[0]?.out_learner_count ?? 0)
    };
  }

  static getSummary(filters: BillCoverageFilters = {}) {
    return this.executeDashboardRPC<BillCoverageSummary>(
      'get_billing_coverage_summary',
      this.baseParams(filters)
    );
  }

  static async getLearners(
    filters: BillCoverageFilters = {}
  ): Promise<{ rows: BillCoverageRow[]; total: number }> {
    const raw = await this.executeDashboardRPC<RawCoverageRow[]>(
      'get_billing_coverage_learners',
      {
        ...this.baseParams(filters),
        p_coverage_state: filters.coverage_state ?? 'not_generated',
        p_search: filters.search ?? null,
        p_page: filters.page ?? 1,
        p_page_size: filters.page_size ?? 50,
        // Sorting runs in Postgres, not on the fetched page — ordering only the
        // visible 50 of ~1,600 rows would show the top of page one rather than
        // the real maximum.
        p_sort_by: filters.sort_by ?? null,
        p_sort_dir: filters.sort_dir ?? 'asc'
      }
    );

    const list = raw ?? [];
    const rows: BillCoverageRow[] = list.map((r) => ({
      learner_id: r.out_learner_id,
      roll_number: r.out_roll_number,
      register_number: r.out_register_number,
      full_name: r.out_full_name,
      lifecycle_status: r.out_lifecycle_status,
      gender: r.out_gender,
      institution_id: r.out_institution_id,
      institution_name: r.out_institution_name,
      program_name: r.out_program_name,
      semester_section: r.out_semester_section,
      academic_year_id: r.out_academic_year_id,
      academic_year_name: r.out_academic_year_name,
      // integer over PostgREST, not numeric — no string coercion needed, but
      // keep the null rather than defaulting to 0, which would read as a year.
      admission_year: r.out_admission_year ?? null,
      target_academic_year_name: r.out_target_academic_year_name,
      accommodation_type: r.out_accommodation_type,
      uses_transport: r.out_uses_transport === true,
      bill_count: Number(r.out_bill_count),
      total_billed: Number(r.out_total_billed),
      // numeric arrives as a string over PostgREST — Number(), like every other
      // money column here, or the export writes text cells Excel cannot sum.
      total_paid: Number(r.out_total_paid ?? 0),
      coverage_state: r.out_coverage_state as BillCoverageRow['coverage_state'],
      // numeric over PostgREST arrives as a string, but a NULL duration must
      // stay null — Number(null) is 0, which would read as a zero-year course
      // and mark every learner's programme as already finished.
      program_duration_yrs:
        r.out_program_duration_yrs == null
          ? null
          : Number(r.out_program_duration_yrs),
      programme_end_year: r.out_programme_end_year,
      total_count: Number(r.out_total_count)
    }));

    // total_count is a window function — identical on every row, absent when
    // the page is empty.
    return { rows, total: rows.length > 0 ? rows[0].total_count : 0 };
  }
}
