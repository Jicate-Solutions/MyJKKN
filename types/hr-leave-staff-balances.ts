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
  /**
   * Days actually accrued so far this year. Equal to `entitled` for any type
   * that is not accrual_type='monthly'; for Casual Leave, which accrues one a
   * month from June, it is the figure that matters — `entitled` reads 12 all
   * year while only `accrued` has been earned.
   *
   * Read this, never `entitled`, when showing what someone may spend. The
   * staff-facing apply drawer has always used it; the admin grid did not until
   * 20260905120100, so the two screens disagreed about the same person.
   */
  accrued: number;
  /** Days locked up by requests awaiting a decision. Already netted off `available`. */
  pending: number;
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
 * One request (or the opening adjustment) that drew on a given month's credit.
 *
 * `days` is the overlap with THAT month's bucket, not the request's length: a
 * two-day request spanning the June/July boundary appears under both months
 * with one day each.
 */
export interface HRLeaveLedgerDraw {
  /** Null for the opening adjustment, which has no application behind it. */
  id: string | null;
  start_date: string | null;
  end_date: string | null;
  /**
   * 'manual' is an admin-recorded month entry — real taken leave with no
   * application behind it. 'opening_adjustment' is the residue of `used` that
   * nothing yet explains, and is what a reclassify entry converts into 'manual'.
   */
  status: 'approved' | 'pending' | 'escalated' | 'manual' | 'opening_adjustment';
  days: number;
}

/**
 * How a month entry treats the year total, `hr_leave_balances.used`.
 *
 *   add        — the leave happened and was never captured. `used` goes UP.
 *   reclassify — the days are already inside `used` (legacy backfill, or an
 *                earlier Adjust correction) and merely sit in the wrong months.
 *                `used` does not move.
 *
 * Picking the wrong one corrupts the balance in opposite directions, so the UI
 * must make the choice explicit rather than defaulting silently.
 */
export type HRLeaveMonthEntryMode = 'add' | 'reclassify' | 'clear';

export interface HRLeaveMonthEntryPayload {
  employee_id: string;
  leave_type_id: string;
  hr_academic_year_id: string;
  /** First of the month, ISO date. */
  month_start: string;
  /**
   * The TOTAL days for the month, not an increment — it overrides what approved
   * applications in that month say. Zero is a real value ("this month was
   * nothing"); pass null with mode 'clear' to remove the override instead.
   */
  days: number | null;
  mode: HRLeaveMonthEntryMode;
  reason: string;
}

/**
 * One month of `fn_hr_leave_monthly_ledger`.
 *
 * TWO VIEWS SHARE EACH ROW AND MUST NOT BE CONFLATED:
 *
 *   * The TIME ledger — accrued_days, opening_days, taken_in_month,
 *     pending_in_month, closing_days. Row = a calendar month. closing_days is
 *     what carries into the next month and reconciles to the cell's
 *     `available` at the current month.
 *   * The BUCKET attribution — consumed_days, reserved_days, drawn_by. Row =
 *     that month's credit, wherever it was eventually spent. June can show
 *     consumed_days 1 with taken_in_month 0: its day went unused, carried
 *     forward, and was spent by a July request.
 *
 * That difference is the whole point of the screen, so label the two column
 * groups distinctly rather than interleaving them.
 */
export interface HRLeaveMonthlyLedgerRow {
  /** First day of the month, ISO date. */
  month_start: string;
  accrued_days: number;
  opening_days: number;
  consumed_days: number;
  reserved_days: number;
  /** Negative means more was spent by this month than had accrued by then. */
  closing_days: number;
  /** Includes `manual_days` — an admin-recorded day IS leave taken that month. */
  taken_in_month: number;
  pending_in_month: number;
  /**
   * The admin-set total for this month. Meaningful only when `is_overridden`;
   * zero otherwise. When overridden this IS `taken_in_month` — an override
   * replaces the month's approved applications rather than adding to them.
   */
  manual_days: number;
  /** True when an admin has set this month's total by hand. */
  is_overridden: boolean;
  /**
   * What the month's approved applications come to, reported even when
   * overridden — so the UI can say "1.5 of these days come from approved
   * requests" and the admin can see what they are overriding rather than
   * silently burying it.
   */
  applications_days: number;
  /**
   * Consumption sitting in hr_leave_balances.used that neither an application
   * nor a month entry explains — the June 2026 legacy backfill, or a correction
   * typed into the Adjust dialog. Constant across every row, drawn from the
   * earliest months. Reclassifying a month converts part of this into
   * `manual_days`, and it is also the cap the RPC enforces on reclassify.
   */
  opening_adjustment: number;
  drawn_by: HRLeaveLedgerDraw[];
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
  /**
   * The window the column header names, resolved from the TYPE's own
   * limit_period. Short Time Off does not carry forward, so "45m left of 2h" is
   * meaningless without saying of which month.
   *
   * A per-cell window can still differ, because an hr_leave_type_assignments row
   * may override limit_period for one person or department — the cell's own
   * period_start/period_end remain authoritative for that staff member.
   */
  period_start: string | null;
  period_end: string | null;
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
  /** Committed requests: approved AND undecided. */
  requests_used: number;
  /** Committed minutes: approved AND undecided. */
  minutes_used: number;
  /**
   * The undecided part of the two figures above — already subtracted from
   * minutes_left, because the database treats a pending request as spent.
   *
   * Broken out because it dominates: September 2026 carried 29 pending
   * Permission requests against 7 approved, so a merged "used" figure reads as
   * approved time when it is mostly nothing of the sort.
   */
  requests_pending: number;
  minutes_pending: number;
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
