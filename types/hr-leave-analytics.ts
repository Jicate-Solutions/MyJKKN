/**
 * Shapes returned by the `hr_leave_balance_analytics` RPC.
 *
 * The RPC takes an hr_academic_years id. It used to take the year NAME, because
 * academic_years rows are per-institution -- '2026-2027' existed 11 times with
 * 11 ids -- and no single id could address a cross-institution view. HR years
 * are group-wide, so one id now serves every institution and the name matching
 * is gone. Pass null for "the year containing today".
 */

/** Why an institution is or isn't provisioned. Drives the status badge. */
export type HRLeaveCoverageStatus =
  | 'complete'          // every active team member has balance rows
  | 'partial'           // some team members covered, some not
  | 'not_generated'     // configured and ready, but nobody has run the generator
  | 'no_types'          // org has zero active leave types — generator writes 0 rows
  | 'no_staff';         // no active team members to provision

// 'no_academic_year' is deliberately absent. It described an institution whose
// own academic_years table had no row covering the period -- a per-institution
// condition that cannot occur now that one HR year serves all of them. A missing
// year is a page-level empty state, not a per-institution status.

export interface HRLeaveInstitutionAnalytics {
  org_id: string;
  institution_id: string;
  institution_name: string;
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

/** One selectable year in the switcher. */
export interface HRLeaveAcademicYearOption {
  id: string;
  year_name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface HRLeaveBalanceAnalytics {
  /** Null only when HR has configured no year covering today. */
  hr_academic_year_id: string | null;
  year_name: string | null;
  start_date: string | null;
  end_date: string | null;
  resolved_by: 'current_date' | 'explicit';
  totals: HRLeaveAnalyticsTotals;
  institutions: HRLeaveInstitutionAnalytics[];
  leave_types: HRLeaveTypeAnalytics[];
  academic_years: HRLeaveAcademicYearOption[];
}
