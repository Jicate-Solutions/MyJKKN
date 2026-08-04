import { BaseService } from '@/lib/services/base-service';
import { ACADEMIC_YEAR_UNSPECIFIED } from './report-filter-params';
import type {
  BillingReportFilters,
  StudentYearBreakdown,
} from '@/types/billing-schedule';

/**
 * Year-wise learner counts and amounts for the /billing/reports dashboard.
 *
 * One RPC call (migration 20260802023000_billing_year_breakdown_rpc.sql). This used to be
 * computed client-side by paging the ENTIRE billing_student_bills table
 * through PostgREST in 1000-row pages — 10,763 bills → ELEVEN sequential
 * requests to /rest/v1/billing_student_bills on every dashboard load
 * (~100–240ms each) just to render the year summary cards. The aggregation now
 * runs in Postgres and a handful of bucket rows come back instead of ~11k
 * bills.
 *
 * Honours the institution, academic year and date filters already on the page.
 * The RPC is gated on billing.reports.view — the same permission the page
 * itself requires — and scoped to the caller's accessible institutions, like
 * the sibling get_billing_reports_* RPCs feeding the totals above these cards.
 */
export class StudentYearBreakdownService extends BaseService {
  static async getBreakdown(
    filters: BillingReportFilters = {}
  ): Promise<StudentYearBreakdown[]> {
    // 'unspecified' is the UI sentinel for "bills with no academic year" —
    // mapped to the boolean flag exactly as buildReportScope does for the
    // other report RPCs on this page.
    const unspecified = filters.academic_year_id === ACADEMIC_YEAR_UNSPECIFIED;

    const { data, error } = await this.supabase.rpc(
      'get_billing_student_year_breakdown',
      {
        p_institution_id: filters.institution_id || null,
        p_academic_year_id: unspecified
          ? null
          : filters.academic_year_id || null,
        p_academic_year_unspecified: unspecified,
        p_date_from: filters.date_from || null,
        p_date_to: filters.date_to || null,
      }
    );
    if (error) throw error;

    // Rows arrive ordered year ASC NULLS LAST (the RPC sorts). bigint/numeric
    // can serialise as strings through PostgREST — normalise to numbers.
    return ((data as any[]) ?? []).map((r) => ({
      year: r.year ?? null,
      student_count: Number(r.student_count) || 0,
      amount_billed: Number(r.amount_billed) || 0,
      amount_collected: Number(r.amount_collected) || 0,
      outstanding: Number(r.outstanding) || 0,
    }));
  }
}
