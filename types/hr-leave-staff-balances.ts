/**
 * Shapes returned by the `hr_leave_balance_staff_detail` RPC and accepted by
 * `hr_leave_balance_adjust`.
 *
 * Sits alongside types/hr-leave-analytics.ts: that module is the INSTITUTION
 * aggregate the Analytics and Generate tabs read, this one is the per-staff
 * drill-down the Staff Balances tab reads. Both are driven by the same
 * page-level hr_academic_years id.
 */

import type { StoLimitMode } from './hr-leave-types';

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

/**
 * One column of the SECOND pivot — an institution's Short Time Off types.
 *
 * Kept apart from HRStaffBalanceLeaveType because the two are denominated
 * differently and cannot share a cell renderer: a day type carries an
 * entitlement that `used` draws down, an STO type carries a per-period minute
 * or request budget that nothing writes to hr_leave_balances at all.
 *
 * These limit fields are the TYPE's own and are here for the column header. A
 * hr_leave_type_assignments row can override the whole limit block for one
 * person or one department, so the authoritative figures are per cell.
 */
export interface HRStaffBalanceStoType {
  id: string;
  code: string;
  name: string;
  limit_mode: StoLimitMode;
  limit_period: string | null;
  total_minutes: number | null;
  max_requests: number | null;
}

/**
 * One STO cell: a single (staff, STO type) budget for the period covering
 * today (or the selected year's last day, when viewing a past year).
 *
 * Deliberately the same shape hr_sto_usage() returns to the staff apply-drawer,
 * plus `exhausted`. The admin figure and the figure the staff member sees are
 * computed by the same two functions server-side — hr_resolve_sto_limits for
 * the precedence and hr_leave_period_window for the window — so they cannot
 * disagree.
 */
export interface HRStaffBalanceStoCell {
  limit_mode: StoLimitMode;
  limit_period: string | null;
  /** Which rule supplied these limits: the type, or an assignment scope. */
  source: 'type' | 'organization' | 'department' | 'staff' | null;
  /**
   * The period could not be resolved, so the database refuses every submission
   * from this person. Reported rather than flattened into limit_mode 'none' —
   * calling someone unlimited while every submit is blocked is the worse lie.
   */
  window_unresolved: boolean;
  period_start: string | null;
  period_end: string | null;
  total_minutes: number | null;
  max_requests: number | null;
  min_minutes: number | null;
  max_minutes: number | null;
  requests_used: number;
  minutes_used: number;
  /** Null unless limit_mode is 'total_duration'. */
  minutes_left: number | null;
  /** Null unless limit_mode is 'request_count'. */
  requests_left: number | null;
  /** Budget spent for the period — the one STO state that needs acting on. */
  exhausted: boolean;
}

/** Per-staff counts of cells needing attention, computed server-side. */
export interface HRStaffBalanceFlags {
  missing_rows: number;
  negative: number;
  overdrawn: number;
  off_policy: number;
  /** STO types whose per-period budget is already spent. */
  sto_exhausted: number;
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
  /** Keyed by leave_type_id, same as `balances` but for the STO column group. */
  sto: Record<string, HRStaffBalanceStoCell>;
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
  /**
   * The second column group. Every institution runs exactly two today —
   * Permission (Hourly) and On Duty (Hourly) — but the set is read per
   * institution for the same reason `leave_types` is.
   */
  sto_types: HRStaffBalanceStoType[];
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
