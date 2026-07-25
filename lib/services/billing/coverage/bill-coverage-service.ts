import { BaseService } from '@/lib/services/base-service';
import type {
  BillCoverageFilters,
  BillCoverageRow,
  BillCoverageSummary
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
  out_institution_id: string;
  out_institution_name: string | null;
  out_program_name: string | null;
  out_academic_year_id: string | null;
  out_academic_year_name: string | null;
  out_accommodation_type: string | null;
  out_uses_transport: boolean | null;
  out_bill_count: number;
  out_total_billed: number | string;
  out_coverage_state: string;
  out_total_count: number | string;
}

export class BillCoverageService extends BaseService {
  /** Empty selections become null so the RPC falls back to the caller's full
   *  accessible scope. Uses ?? rather than || — undefined must never be passed
   *  through as a real parameter value. */
  private static baseParams(filters: BillCoverageFilters) {
    return {
      p_academic_year_id: filters.academic_year_id ?? null,
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
      p_transport: filters.transport ?? 'any'
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
        p_page_size: filters.page_size ?? 50
      }
    );

    const list = raw ?? [];
    const rows: BillCoverageRow[] = list.map((r) => ({
      learner_id: r.out_learner_id,
      roll_number: r.out_roll_number,
      register_number: r.out_register_number,
      full_name: r.out_full_name,
      lifecycle_status: r.out_lifecycle_status,
      institution_id: r.out_institution_id,
      institution_name: r.out_institution_name,
      program_name: r.out_program_name,
      academic_year_id: r.out_academic_year_id,
      academic_year_name: r.out_academic_year_name,
      accommodation_type: r.out_accommodation_type,
      uses_transport: r.out_uses_transport === true,
      bill_count: Number(r.out_bill_count),
      total_billed: Number(r.out_total_billed),
      coverage_state: r.out_coverage_state as BillCoverageRow['coverage_state'],
      total_count: Number(r.out_total_count)
    }));

    // total_count is a window function — identical on every row, absent when
    // the page is empty.
    return { rows, total: rows.length > 0 ? rows[0].total_count : 0 };
  }
}
