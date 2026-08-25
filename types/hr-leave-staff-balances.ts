/**
 * Shapes returned by the `hr_leave_balance_staff_detail` RPC and accepted by
 * `hr_leave_balance_adjust`.
 *
 * Sits alongside types/hr-leave-analytics.ts: that module is the INSTITUTION
 * aggregate the Analytics and Generate tabs read, this one is the per-staff
 * drill-down the Staff Balances tab reads. Both are driven by the same
 * page-level hr_academic_years id.
 */

/**
 * Which of the three entitlement tiers supplied the number, straight from
 * v_hr_leave_balance_src's CASE:
 *   override — an hr_leave_entitlement_overrides row for this exact cell
 *   frozen   — hr_leave_balances.entitled holds a literal, detached from policy
 *   policy   — entitled is NULL, so hr_leave_types.default_entitled_days wins
 *              and the row keeps tracking the policy. This is the healthy state.
 */
export type HRLeaveEntitlementSource = 'override' | 'frozen' | 'policy';

/** One column of the pivot — an institution's day-denominated leave types. */
export interface HRStaffBalanceLeaveType {
  id: string;
  code: string;
  name: string;
  default_days: number;
}

/** One cell: a single (staff, leave type) balance for the selected year. */
export interface HRStaffBalanceCell {
  entitled: number;
  used: number;
  carried: number;
  available: number;
  source: HRLeaveEntitlementSource;
  /**
   * False when no hr_leave_balances row exists. The view still returns the
   * cell (entitlement resolves from policy), but approving leave against it
   * writes a row seeded from zero — so an unprovisioned person can end up
   * permanently negative. This is the flag the generator exists to clear.
   */
  has_row: boolean;
}

/** Per-staff counts of cells needing attention, computed server-side. */
export interface HRStaffBalanceFlags {
  missing_rows: number;
  negative: number;
  overdrawn: number;
  off_policy: number;
}

export interface HRStaffBalanceRow {
  employee_id: string;
  /** staff.staff_id — the employee code. Null for staff who have none. */
  staff_code: string | null;
  name: string;
  department: string | null;
  /**
   * Filter attributes, mirroring the /staff/list filter bar. Carried on the row
   * rather than fetched per facet because the tab loads one institution at a
   * time (152 staff at the largest) — and because facet counts can only agree
   * with an ANDed table if both read the same array.
   *
   * Every one of these is fully populated in production; the nullability is
   * the schema's, not an observed gap. `department_id` is the exception worth
   * knowing about: Main Office assigns no departments at all, so all 131 of its
   * staff land in the "Unassigned" bucket.
   */
  department_id: string | null;
  designation: string | null;
  /** staff.institution_email — searched, not displayed. */
  email: string | null;
  /** Lowercase on this table ('male'/'female'), unlike the learner tables. */
  gender: string | null;
  category_id: string | null;
  category_name: string | null;
  /**
   * employment_categories.is_teaching — the ONLY reliable teaching split.
   * staff.role_type reads 'teacher' for every row and employment_type reads
   * 'full_time' for every row, so neither can drive a filter.
   */
  is_teaching: boolean | null;
  role_key: string | null;
  role_name: string | null;
  /** Keyed by leave_type_id, so the pivot is a lookup rather than a search. */
  balances: Record<string, HRStaffBalanceCell>;
  flags: HRStaffBalanceFlags;
}

export interface HRStaffBalanceDetail {
  /** Null only when HR has configured no year covering today. */
  hr_academic_year_id: string | null;
  year_name: string | null;
  start_date: string | null;
  end_date: string | null;
  org_id: string;
  institution_name: string;
  /**
   * The pivot's column set, and deliberately per-institution: Main Office has
   * two active day-types where most colleges have four, and Matric/Nattraja
   * have one. Rendering a fixed column set would show empty columns that look
   * like missing data.
   */
  leave_types: HRStaffBalanceLeaveType[];
  staff: HRStaffBalanceRow[];
}

/**
 * `set_used` corrects consumed days on hr_leave_balances and needs
 * hr.leave.policies.write; the two entitlement actions write
 * hr_leave_entitlement_overrides and need hr.leave.balance.manage. The RPC
 * enforces each separately so it widens nobody's access beyond what the
 * tables' own RLS already allows.
 */
export type HRBalanceAdjustAction = 'set_used' | 'set_entitlement' | 'clear_entitlement';

export interface HRBalanceAdjustPayload {
  employee_id: string;
  leave_type_id: string;
  hr_academic_year_id: string;
  action: HRBalanceAdjustAction;
  /** Ignored for clear_entitlement; must be >= 0 otherwise. */
  value: number | null;
  reason: string;
}

export interface HRBalanceAdjustResult {
  ok: boolean;
  action: HRBalanceAdjustAction;
  old: Record<string, number | null> | null;
  new: Record<string, number | null> | null;
}
