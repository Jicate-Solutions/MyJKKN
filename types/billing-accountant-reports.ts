// types/billing-accountant-reports.ts
// Types for the Accountant Advanced Reports hub (/billing/reports/accountant).
// Numeric fields arrive from PostgREST as strings; coerce with num() at the edge.

export type ReportScheme = 'all' | 'first_graduate' | 'pmss' | 'scholarship_7_5';
export type CollectionsGroupBy = 'college' | 'course' | 'date';

export interface AccountantReportFilters {
  institution_ids?: string[];
  date_from?: string;
  date_to?: string;
  academic_year_id?: string;
  scheme?: ReportScheme;
}

/** One row of get_billing_report_collections (per college / course / date). */
export interface CollectionsRow {
  group_key: string;
  group_label: string;
  bill_count: number;
  student_count: number;
  collected: number;
  outstanding: number;
  collection_rate: number;
  cleared_bill_count: number;
  cleared_amount: number;
}

/** One row of get_billing_report_outstanding_by_year. */
export interface OutstandingByYearRow {
  academic_year_id: string | null;
  academic_year_name: string;
  institution_id: string;
  institution_name: string;
  students_with_dues: number;
  bill_count: number;
  outstanding: number;
}

/** One row of get_billing_report_schemes. */
export interface SchemeRow {
  scheme: 'first_graduate' | 'pmss' | 'scholarship_7_5';
  scheme_label: string;
  student_count: number;
  billed: number;
  collected: number;
  outstanding: number;
  concession_amount: number;
}

/** Single-row result of get_billing_report_kpis. */
export interface ReportKpis {
  collected: number;
  outstanding: number;
  cleared_bill_count: number;
  cleared_amount: number;
  concession_amount: number;
  students_billed: number;
}

export interface ReportAcademicYear {
  id: string;
  academic_year_name: string;
  institution_id: string;
}
