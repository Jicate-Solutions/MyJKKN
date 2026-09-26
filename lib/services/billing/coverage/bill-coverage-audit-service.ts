import { BaseService } from '@/lib/services/base-service';
import { getErrorMessage } from '@/lib/utils';
import type {
  BillCoverageFilters,
  DuplicateYearAuditRow,
  DuplicateYearAuditSummary,
  FeeStructureAuditFilters,
  FeeStructureAuditIssue,
  FeeStructureAuditLearnerRow,
  FeeStructureAuditRow,
  FeeStructureLearnerDetail,
  FeeStructureAuditSummary,
  GenerateMissingBillsResult,
  NoStructureReason,
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

interface RawFeeStructureRow {
  out_learner_id: string;
  out_full_name: string;
  out_roll_number: string | null;
  out_lifecycle_status: string;
  out_institution_id: string;
  out_institution_name: string | null;
  out_program_name: string | null;
  out_admission_year: number | null;
  out_structure_name: string | null;
  out_category_id: string | null;
  out_category_name: string | null;
  out_category_kind: string | null;
  out_schedule_mode: string | null;
  out_expected_amount: number | string | null;
  out_expected_instalments: number | null;
  out_bill_count: number;
  out_billed_amount: number | string;
  out_paid_amount: number | string;
  out_bill_instalments: number;
  out_issue: string;
  out_no_structure_reason: string | null;
  out_flag_other_structure: boolean;
  out_flag_amount_mismatch: boolean;
  out_flag_not_linked: boolean;
  out_flag_split_missing: boolean;
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

  // ── Fee Structure Match (migration 20260925170000) ─────────────────────────
  // The structure is resolved in Postgres with admission_match_fee_structure_for_learner
  // — the same resolver bill generation uses — so this layer only maps rows.
  // These RPCs take a narrower parameter set than the tuition audits: no
  // transport / semester / section (a fee structure does not vary by them).
  private static feeStructureParams(filters: BillCoverageFilters & FeeStructureAuditFilters) {
    const b = this.baseParams(filters);
    return {
      p_category_ids:
        filters.category_ids && filters.category_ids.length > 0 ? filters.category_ids : null,
      p_schedule_mode: filters.schedule_mode ?? null,
      p_structure_search: filters.structure_search?.trim() || null,
      p_institution_ids: b.p_institution_ids,
      p_lifecycle_statuses: b.p_lifecycle_statuses,
      p_admission_year: b.p_admission_year,
      p_degree_id: b.p_degree_id,
      p_department_id: b.p_department_id,
      p_program_id: b.p_program_id,
      p_gender: b.p_gender,
      p_accommodation_type_ids: b.p_accommodation_type_ids
    };
  }

  static getFeeStructureMatchSummary(
    filters: BillCoverageFilters & FeeStructureAuditFilters = {}
  ) {
    return this.executeDashboardRPC<FeeStructureAuditSummary>(
      'get_billing_audit_fee_structure_match_summary',
      this.feeStructureParams(filters)
    );
  }

  static async getFeeStructureMatch(
    filters: BillCoverageFilters & FeeStructureAuditFilters = {}
  ): Promise<{ rows: FeeStructureAuditRow[]; total: number }> {
    const raw = await this.executeDashboardRPC<RawFeeStructureRow[]>(
      'get_billing_audit_fee_structure_match',
      {
        ...this.feeStructureParams(filters),
        p_issue: filters.issue ?? null,
        p_include_ok: filters.include_ok ?? false,
        p_include_no_structure_institutions:
          filters.include_no_structure_institutions ?? false,
        p_search: filters.search ?? null,
        p_page: filters.page ?? 1,
        p_page_size: filters.page_size ?? 50,
        p_sort_by: filters.sort_by ?? 'full_name',
        p_sort_dir: filters.sort_dir ?? 'asc'
      }
    );

    const rows: FeeStructureAuditRow[] = (raw ?? []).map((r) => ({
      row_id: `${r.out_learner_id}:${r.out_category_name ?? 'none'}`,
      learner_id: r.out_learner_id,
      full_name: r.out_full_name,
      roll_number: r.out_roll_number,
      lifecycle_status: r.out_lifecycle_status,
      institution_id: r.out_institution_id,
      institution_name: r.out_institution_name,
      program_name: r.out_program_name,
      admission_year: r.out_admission_year ?? null,
      structure_name: r.out_structure_name,
      category_id: r.out_category_id,
      category_name: r.out_category_name,
      category_kind: r.out_category_kind,
      schedule_mode: r.out_schedule_mode,
      // Keep null for the no-structure rows: 0 would read as "a ₹0 fee".
      expected_amount: r.out_expected_amount == null ? null : Number(r.out_expected_amount),
      expected_instalments: r.out_expected_instalments ?? null,
      bill_count: Number(r.out_bill_count ?? 0),
      billed_amount: Number(r.out_billed_amount ?? 0),
      paid_amount: Number(r.out_paid_amount ?? 0),
      bill_instalments: Number(r.out_bill_instalments ?? 0),
      issue: r.out_issue as FeeStructureAuditIssue,
      no_structure_reason: (r.out_no_structure_reason as NoStructureReason) ?? null,
      flag_other_structure: r.out_flag_other_structure === true,
      flag_amount_mismatch: r.out_flag_amount_mismatch === true,
      flag_not_linked: r.out_flag_not_linked === true,
      flag_split_missing: r.out_flag_split_missing === true,
      total_count: Number(r.out_total_count ?? 0)
    }));

    return { rows, total: rows.length > 0 ? rows[0].total_count : 0 };
  }

  /** One row per learner (migration 20260925190000). */
  static async getFeeStructureLearners(
    filters: BillCoverageFilters & FeeStructureAuditFilters = {}
  ): Promise<{ rows: FeeStructureAuditLearnerRow[]; total: number }> {
    const raw = await this.executeDashboardRPC<Record<string, any>[]>(
      'get_billing_audit_fee_structure_learners',
      {
        ...this.feeStructureParams(filters),
        p_issue: filters.issue ?? null,
        p_include_ok: filters.include_ok ?? false,
        p_include_no_structure_institutions:
          filters.include_no_structure_institutions ?? false,
        p_search: filters.search ?? null,
        p_page: filters.page ?? 1,
        p_page_size: filters.page_size ?? 50,
        p_sort_by: filters.sort_by ?? 'full_name',
        p_sort_dir: filters.sort_dir ?? 'asc'
      }
    );
    const n = (v: unknown) => Number(v ?? 0);
    const rows: FeeStructureAuditLearnerRow[] = (raw ?? []).map((r) => ({
      learner_id: r.out_learner_id,
      full_name: r.out_full_name,
      roll_number: r.out_roll_number ?? null,
      lifecycle_status: r.out_lifecycle_status,
      institution_id: r.out_institution_id,
      institution_name: r.out_institution_name ?? null,
      program_name: r.out_program_name ?? null,
      admission_year: r.out_admission_year ?? null,
      structure_name: r.out_structure_name ?? null,
      items: n(r.out_items),
      ok: n(r.out_ok),
      missing_bill: n(r.out_missing_bill),
      amount_mismatch: n(r.out_amount_mismatch),
      other_structure: n(r.out_other_structure),
      not_linked: n(r.out_not_linked),
      split_missing: n(r.out_split_missing),
      other_module: n(r.out_other_module),
      no_structure: r.out_no_structure === true,
      no_structure_reason: (r.out_no_structure_reason as NoStructureReason) ?? null,
      problems: n(r.out_problems),
      worst_issue: r.out_worst_issue as FeeStructureAuditIssue,
      expected_total: n(r.out_expected_total),
      billed_total: n(r.out_billed_total),
      paid_total: n(r.out_paid_total),
      missing_amount: n(r.out_missing_amount),
      total_count: n(r.out_total_count)
    }));
    return { rows, total: rows.length > 0 ? rows[0].total_count : 0 };
  }

  /** Everything for one learner — the comparison dialog. Null = not visible. */
  static async getFeeStructureLearnerDetail(
    learnerId: string
  ): Promise<FeeStructureLearnerDetail | null> {
    const { data, error } = await this.supabase.rpc(
      'get_billing_audit_fee_structure_learner_detail',
      { p_learner_id: learnerId }
    );
    if (error) throw new Error(getErrorMessage(error));
    if (!data) return null;
    const num = (v: unknown) => (v == null ? null : Number(v));
    const d = data as FeeStructureLearnerDetail;
    return {
      learner_id: d.learner_id,
      items: (d.items ?? []).map((it) => ({
        ...it,
        expected_amount: num(it.expected_amount),
        billed_amount: Number(it.billed_amount ?? 0),
        paid_amount: Number(it.paid_amount ?? 0),
        bills: (it.bills ?? []).map((b) => ({ ...b, amount: Number(b.amount ?? 0), paid: Number(b.paid ?? 0) }))
      })),
      extra_bills: (d.extra_bills ?? []).map((b) => ({ ...b, amount: Number(b.amount ?? 0), paid: Number(b.paid ?? 0) }))
    };
  }

  /**
   * Raise the bills a learner's fee structure expects but that do not exist
   * (fn_billing_generate_missing_structure_bills, migration 20260925180000).
   * dryRun = true returns the preview and writes nothing. Hostel / mess /
   * transport are never generated here. Gate: billing.schedule.bulk_create.
   */
  static async generateMissingBills(
    learnerIds: string[],
    dryRun: boolean
  ): Promise<GenerateMissingBillsResult> {
    const { data, error } = await this.supabase.rpc(
      'fn_billing_generate_missing_structure_bills',
      { p_learner_ids: learnerIds, p_dry_run: dryRun }
    );
    // Supabase errors are plain objects — surface code/message, never swallow.
    if (error) throw new Error(getErrorMessage(error));
    const r = (data ?? {}) as GenerateMissingBillsResult;
    return {
      dry_run: r.dry_run === true,
      bills: Number(r.bills ?? 0),
      amount: Number(r.amount ?? 0),
      learners_with_bills: Number(r.learners_with_bills ?? 0),
      learners_skipped: Number(r.learners_skipped ?? 0),
      learners: (r.learners ?? []).map((l) => ({
        ...l,
        bills: (l.bills ?? []).map((b) => ({ ...b, amount: Number(b.amount ?? 0) })),
        skipped: l.skipped ?? []
      }))
    };
  }
}
