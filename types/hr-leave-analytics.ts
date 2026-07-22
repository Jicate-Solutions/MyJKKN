/**
 * Shapes returned by the `hr_leave_balance_analytics` RPC.
 *
 * The RPC resolves ONE academic year per institution: academic_years rows are
 * per-institution, so the name '2026-2027' exists 11 times with differing
 * start/end dates and a single academic_year_id cannot address a
 * cross-institution view. Callers pass the year NAME (or null for "today").
 */

/** Why an institution is or isn't provisioned. Drives the status badge. */
export type HRLeaveCoverageStatus =
  | 'complete'          // every active staff member has balance rows
  | 'partial'           // some staff covered, some not
  | 'not_generated'     // configured and ready, but nobody has run the generator
  | 'no_types'          // org has zero active leave types — generator writes 0 rows
  | 'no_academic_year'  // no academic_years row covers the period — cannot generate
  | 'no_staff';         // no active staff to provision

export interface HRLeaveInstitutionAnalytics {
  org_id: string;
  institution_id: string;
  institution_name: string;
  ay_id: string | null;
  ay_name: string | null;
  start_date: string | null;
  end_date: string | null;
  active_staff: number;
  staff_with_cadre: number;
  active_types: number;
  /** Sum of default_entitled_days across the org's active types. */
  days_per_head: number;
  balance_rows: number;
  staff_covered: number;
  entitled: number;
  carried: number;
  used: number;
  status: HRLeaveCoverageStatus;
}

export interface HRLeaveTypeAnalytics {
  code: string;
  name: string;
  color_code: string;
  orgs_offering: number;
  default_days: number;
  entitled: number;
  carried: number;
  used: number;
  balance_rows: number;
  staff_count: number;
}

export interface HRLeaveAnalyticsTotals {
  institutions: number;
  institutions_covered: number;
  active_staff: number;
  staff_covered: number;
  staff_with_cadre: number;
  balance_rows: number;
  entitled: number;
  carried: number;
  used: number;
  uncovered_staff: number;
  orgs_without_types: number;
  orgs_not_generated: number;
}

export interface HRLeaveAcademicYearOption {
  ay_name: string;
  institutions: number;
  is_current: boolean;
  earliest_start: string;
}

export interface HRLeaveBalanceAnalytics {
  academic_year_name: string | null;
  resolved_by: 'current_date' | 'explicit';
  totals: HRLeaveAnalyticsTotals;
  institutions: HRLeaveInstitutionAnalytics[];
  leave_types: HRLeaveTypeAnalytics[];
  academic_years: HRLeaveAcademicYearOption[];
}
