import { BaseService } from '@/lib/services/base-service';
import type {
  BillCoverageFilters,
  DuplicateYearAuditRow,
  DuplicateYearAuditSummary,
  MissingYearAuditRow,
  MissingYearAuditSummary
} from '@/types/billing-coverage';
import { LEARNER_SCOPE_DEFAULT } from '@/types/billing-coverage';

// ============================================================================
// BILL COVERAGE AUDIT SERVICE
// ============================================================================
// The /billing/coverage Audit tab. Thin wrapper over four SECURITY DEFINER RPCs
// (migration 20260812150000), all gated on the EXISTING billing.coverage.view
// key — the audit is a view of the same data, not a new capability, so it needs
// no permission key of its own and therefore no role-grant migration.
//
// Same conventions as BillCoverageService: the RPCs prefix output columns with
// out_ to dodge the 42702 ambiguous-column error this schema raises on a
// RETURNS TABLE column named institution_id, and this layer strips it.
//
// TWO PARAMETERS THE COVERAGE RPCs TAKE AND THESE DO NOT:
//   p_academic_year_id    — the audit spans years by definition; there is no
//                           single year to measure against.
//   p_billing_category_id — the audit IS the tuition-category check, so letting
//                           a caller narrow to "3 Year Tuition Fee" would ask
//                           "is the 3 Year fee missing from every year", which
//                           is not a question either audit answers.
//
// The category set the audit checks against lives in Postgres
// (fn_billing_tuition_equivalent_category_ids) and is intentionally NOT
// mirrored here. It is wider than kind = 'tuition' — Government 7-5 quota and
// the CRRI / AHS internship fees count too — and a second copy on this side
// would be one more thing to forget when it changes.
// ============================================================================

interface RawMissingYearRow {
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
  out_admission_year: number | null;
  out_expected_years: number;
  out_billed_years: number;
  out_missing_years: number;
  out_missing_year_names: string | null;
  out_first_missing_year: string | null;
  out_has_current_year: boolean | null;
  out_tuition_bill_count: number;
  out_total_billed: number | string;
  out_total_paid: number | string;
  out_unassigned_tuition_bills: number;
  out_audit_state: string;
  out_program_duration_yrs: number | string | null;
  out_programme_end_year: string | null;
  out_duration_configured: boolean | null;
  out_total_count: number | string;
}

interface RawDuplicateYearRow {
  out_audit_row_id: string;
  out_learner_id: string;
  out_roll_number: string | null;
  out_register_number: string | null;
  out_full_name: string;
  out_lifecycle_status: string;
  out_institution_id: string;
  out_institution_name: string | null;
  out_program_name: string | null;
  out_semester_section: string | null;
  out_admission_year: number | null;
  out_academic_year_name: string;
  out_bill_count: number;
  out_category_names: string | null;
  out_total_billed: number | string;
  out_total_paid: number | string;
  out_outstanding: number | string;
  out_created_same_day: boolean | null;
  out_due_year_span: number;
  out_programme_end_year: string | null;
  out_is_past_programme_end: boolean | null;
  out_total_count: number | string;
}

export class BillCoverageAuditService extends BaseService {
  /** The dimension filters both audits share, in the RPCs' parameter names.
   *  `??` never `||`: '' would flow through as a real uuid and match zero rows,
   *  and undefined would reach Postgres as the literal string "undefined". */
  private static baseParams(filters: BillCoverageFilters) {
    return {
      p_institution_ids:
        filters.institution_ids && filters.institution_ids.length > 0
          ? filters.institution_ids
          : null,
      p_lifecycle_statuses:
        filters.lifecycle_statuses && filters.lifecycle_statuses.length > 0
          ? filters.lifecycle_statuses
          : [...LEARNER_SCOPE_DEFAULT],
      // The tuition-specific institution guard, NOT the coverage tab's
      // include_non_billing_institutions. An institution can bill transport and
      // never tuition, which that flag would wave through as 490 phantom gaps.
      p_include_non_tuition_institutions:
        filters.include_non_tuition_institutions ?? false,
      p_accommodation_type_ids:
        filters.accommodation_type_ids &&
        filters.accommodation_type_ids.length > 0
          ? filters.accommodation_type_ids
          : null,
      p_transport: filters.transport ?? 'any',
      p_gender: filters.gender ?? null,
      p_degree_id: filters.degree_id ?? null,
      p_department_id: filters.department_id ?? null,
      p_program_id: filters.program_id ?? null,
      p_semester_id: filters.semester_id ?? null,
      p_section_id: filters.section_id ?? null,
      // Population filter — the audit's lower bound is the learner's own cohort,
      // this narrows WHICH learners are audited.
      p_admission_year: filters.admission_year ?? null,
      // Window floor. Null audits back to each learner's cohort.
      p_earliest_academic_year: filters.earliest_academic_year ?? null
    };
  }

  static getMissingYearsSummary(filters: BillCoverageFilters = {}) {
    return this.executeDashboardRPC<MissingYearAuditSummary>(
      'get_billing_audit_missing_years_summary',
      this.baseParams(filters)
    );
  }

  static async getMissingYears(
    filters: BillCoverageFilters = {}
  ): Promise<{ rows: MissingYearAuditRow[]; total: number }> {
    const raw = await this.executeDashboardRPC<RawMissingYearRow[]>(
      'get_billing_audit_missing_years',
      {
        ...this.baseParams(filters),
        p_audit_state: filters.audit_state ?? 'gap',
        p_search: filters.search ?? null,
        p_page: filters.page ?? 1,
        p_page_size: filters.page_size ?? 50,
        // Sorting runs in Postgres. Ordering only the fetched page would sort
        // the top 50 of 1,193 rather than surfacing the real worst backlogs.
        p_sort_by: filters.sort_by ?? null,
        p_sort_dir: filters.sort_dir ?? 'asc'
      }
    );

    const list = raw ?? [];
    const rows: MissingYearAuditRow[] = list.map((r) => ({
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
      admission_year: r.out_admission_year ?? null,
      expected_years: Number(r.out_expected_years ?? 0),
      billed_years: Number(r.out_billed_years ?? 0),
      missing_years: Number(r.out_missing_years ?? 0),
      missing_year_names: r.out_missing_year_names,
      first_missing_year: r.out_first_missing_year,
      has_current_year: r.out_has_current_year === true,
      tuition_bill_count: Number(r.out_tuition_bill_count ?? 0),
      // numeric arrives as a string over PostgREST — Number() or the export
      // writes text cells Excel cannot sum.
      total_billed: Number(r.out_total_billed ?? 0),
      total_paid: Number(r.out_total_paid ?? 0),
      unassigned_tuition_bills: Number(r.out_unassigned_tuition_bills ?? 0),
      audit_state: r.out_audit_state as MissingYearAuditRow['audit_state'],
      // Keep NULL as null: Number(null) is 0, which would read as a zero-year
      // programme and imply every learner's course had already finished.
      program_duration_yrs:
        r.out_program_duration_yrs == null
          ? null
          : Number(r.out_program_duration_yrs),
      programme_end_year: r.out_programme_end_year,
      duration_configured: r.out_duration_configured === true,
      total_count: Number(r.out_total_count ?? 0)
    }));

    return { rows, total: rows.length > 0 ? rows[0].total_count : 0 };
  }

  static getDuplicateYearsSummary(filters: BillCoverageFilters = {}) {
    return this.executeDashboardRPC<DuplicateYearAuditSummary>(
      'get_billing_audit_duplicate_years_summary',
      this.baseParams(filters)
    );
  }

  static async getDuplicateYears(
    filters: BillCoverageFilters = {}
  ): Promise<{ rows: DuplicateYearAuditRow[]; total: number }> {
    const raw = await this.executeDashboardRPC<RawDuplicateYearRow[]>(
      'get_billing_audit_duplicate_years',
      {
        ...this.baseParams(filters),
        // No p_audit_state: a row exists here only because it is a violation.
        p_search: filters.search ?? null,
        p_page: filters.page ?? 1,
        p_page_size: filters.page_size ?? 50,
        p_sort_by: filters.sort_by ?? null,
        p_sort_dir: filters.sort_dir ?? 'asc'
      }
    );

    const list = raw ?? [];
    const rows: DuplicateYearAuditRow[] = list.map((r) => ({
      audit_row_id: r.out_audit_row_id,
      learner_id: r.out_learner_id,
      roll_number: r.out_roll_number,
      register_number: r.out_register_number,
      full_name: r.out_full_name,
      lifecycle_status: r.out_lifecycle_status,
      institution_id: r.out_institution_id,
      institution_name: r.out_institution_name,
      program_name: r.out_program_name,
      semester_section: r.out_semester_section,
      admission_year: r.out_admission_year ?? null,
      academic_year_name: r.out_academic_year_name,
      bill_count: Number(r.out_bill_count ?? 0),
      category_names: r.out_category_names,
      total_billed: Number(r.out_total_billed ?? 0),
      total_paid: Number(r.out_total_paid ?? 0),
      outstanding: Number(r.out_outstanding ?? 0),
      created_same_day: r.out_created_same_day === true,
      due_year_span: Number(r.out_due_year_span ?? 0),
      programme_end_year: r.out_programme_end_year,
      is_past_programme_end: r.out_is_past_programme_end === true,
      total_count: Number(r.out_total_count ?? 0)
    }));

    return { rows, total: rows.length > 0 ? rows[0].total_count : 0 };
  }
}
