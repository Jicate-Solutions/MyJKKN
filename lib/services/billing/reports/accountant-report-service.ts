import { BaseService } from '@/lib/services/base-service';
import type {
  AccountantReportFilters,
  CollectionsRow,
  CollectionsGroupBy,
  OutstandingByYearRow,
  SchemeRow,
  ReportKpis,
  ReportAcademicYear,
} from '@/types/billing-accountant-reports';

// Thin wrapper over the 4 accountant-report RPCs (migration 20260724090000).
// Aggregation + scope + permission gating all live in Postgres.
export class BillingAccountantReportService extends BaseService {
  private static scope(f: AccountantReportFilters) {
    return {
      p_institution_ids:
        f.institution_ids && f.institution_ids.length > 0 ? f.institution_ids : null,
      p_date_from: f.date_from ?? null,
      p_date_to: f.date_to ?? null,
      p_academic_year_id: f.academic_year_id ?? null,
      p_scheme: f.scheme ?? 'all',
    };
  }

  static getCollections(f: AccountantReportFilters, groupBy: CollectionsGroupBy) {
    return this.executeDashboardRPC<CollectionsRow[]>(
      'get_billing_report_collections',
      { ...this.scope(f), p_group_by: groupBy }
    );
  }

  static getOutstandingByYear(f: AccountantReportFilters) {
    return this.executeDashboardRPC<OutstandingByYearRow[]>(
      'get_billing_report_outstanding_by_year',
      {
        p_institution_ids:
          f.institution_ids && f.institution_ids.length > 0 ? f.institution_ids : null,
        p_academic_year_id: f.academic_year_id ?? null,
        p_scheme: f.scheme ?? 'all',
      }
    );
  }

  static getSchemes(f: AccountantReportFilters) {
    return this.executeDashboardRPC<SchemeRow[]>('get_billing_report_schemes', {
      p_institution_ids:
        f.institution_ids && f.institution_ids.length > 0 ? f.institution_ids : null,
      p_academic_year_id: f.academic_year_id ?? null,
      p_date_from: f.date_from ?? null,
      p_date_to: f.date_to ?? null,
    });
  }

  static async getKpis(f: AccountantReportFilters): Promise<ReportKpis> {
    const rows = await this.executeDashboardRPC<ReportKpis[]>(
      'get_billing_report_kpis',
      this.scope(f)
    );
    return (
      rows?.[0] ?? {
        collected: 0,
        outstanding: 0,
        cleared_bill_count: 0,
        cleared_amount: 0,
        concession_amount: 0,
        students_billed: 0,
      }
    );
  }

  /** Active academic years for the filter bar (RLS scopes to accessible rows). */
  static async getAcademicYears(institutionId?: string): Promise<ReportAcademicYear[]> {
    let q = this.supabase
      .from('academic_years')
      .select('id, academic_year_name, institution_id')
      .eq('is_active', true)
      .order('academic_year_name', { ascending: false });
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q;
    if (error) throw new Error(`Failed to load academic years: ${error.message}`);
    return (data ?? []) as ReportAcademicYear[];
  }
}
