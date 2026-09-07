/**
 * HR Work Patterns — TypeScript contracts.
 * Created: 2026-09-04.
 *
 * Mirrors supabase/migrations/20260904120000_hr_work_patterns.sql.
 *
 * A work pattern is an institution-scoped, named set of WORKING DAYS with its
 * own days-per-leave-type. Hours are never here: a member keeps the hours of
 * their ordinary Shift Timings row (teaching / non-teaching / category /
 * gender), and the pattern switches OFF the weekdays it does not work. It can
 * remove days, never add one the institution's week does not work. The days
 * are effective-dated (hr_work_pattern_weeks), like shift weeks are, so a
 * later change cannot rewrite months already judged.
 */

import type { IsoDayOfWeek } from '@/types/hr-shift-timings';

export interface HRWorkPattern {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRWorkPatternInsert {
  institution_id: string;
  name: string;
  description?: string | null;
  sort_order?: number;
}

export type HRWorkPatternUpdate = Partial<
  Pick<HRWorkPattern, 'name' | 'description' | 'sort_order' | 'is_active'>
>;

/** One row of hr_work_pattern_leave_entitlements, with the type named. */
export interface HRWorkPatternLeaveEntitlement {
  id: string;
  work_pattern_id: string;
  leave_type_id: string;
  entitled_days: number;
  leave_type_code: string;
  leave_type_name: string;
}

export interface WorkPatternEntitlementInput {
  leave_type_id: string;
  entitled_days: number;
}

/** A day-based leave type of the pattern's institution, for the entitlement editor. */
export interface WorkPatternLeaveTypeOption {
  id: string;
  leave_type_code: string;
  leave_type_name: string;
  /** What a person with no pattern figure gets — shown as the placeholder. */
  default_entitled_days: number;
}

export interface HRStaffWorkPatternAssignment {
  id: string;
  staff_id: string;
  work_pattern_id: string;
  institution_id: string;
  effective_from: string;
  /** Exclusive: the pattern stops applying ON this date. */
  effective_until: string | null;
  notes: string | null;
}

/** One effective-dated row of a pattern's working days. */
export interface HRWorkPatternWeek {
  id: string;
  work_pattern_id: string;
  /** ISO weekdays 1=Mon .. 7=Sun, sorted. */
  working_days: IsoDayOfWeek[];
  effective_from: string;
  /** Exclusive. */
  effective_until: string | null;
  notes: string | null;
}

/** fn_hr_set_work_pattern_days */
export interface SetWorkPatternDaysResult {
  pattern_id: string;
  working_days: IsoDayOfWeek[];
  effective_from: string;
  /** True when a previous days row was closed at the date (a future change). */
  superseded: boolean;
}

/** A pattern as listed: its row plus what the days, members and figures look like. */
export interface WorkPatternSummary extends HRWorkPattern {
  /** For the "All institutions" listing; null only if the join was unreadable. */
  institution_name: string | null;
  /** From the days row in force on `asOf`; empty when none has been saved yet. */
  working_days: IsoDayOfWeek[];
  days_effective_from: string | null;
  member_count: number;
  entitlements: Array<{ leave_type_code: string; entitled_days: number }>;
}

export interface WorkPatternMember {
  assignment_id: string;
  staff_id: string;
  /** staff.staff_id — the employee code. */
  staff_code: string | null;
  name: string;
  designation: string | null;
  category_name: string | null;
  effective_from: string;
  effective_until: string | null;
  notes: string | null;
}

/** A staff member the Assign dialog can pick, with what they hold today. */
export interface AssignableStaff {
  staff_id: string;
  staff_code: string | null;
  name: string;
  designation: string | null;
  category_name: string | null;
  current_pattern_id: string | null;
  current_pattern_name: string | null;
}

/** What a staff member holds on a date — the profile badge. */
export interface StaffWorkPatternCurrent {
  assignment_id: string;
  work_pattern_id: string;
  pattern_name: string;
  effective_from: string;
  effective_until: string | null;
}

// ---------------------------------------------------------------------------
// fn_hr_assign_work_pattern
// ---------------------------------------------------------------------------

export interface AssignWorkPatternChange {
  leave_type_code: string;
  year_name: string;
  /** Effective figures — COALESCE(override, entitled, default) — before and after. */
  from: number;
  to: number;
  /** True when an hr_leave_entitlement_overrides row outranks the pattern figure. */
  overridden: boolean;
}

export interface AssignWorkPatternStaffResult {
  staff_id: string;
  staff_code: string | null;
  name: string;
  previous_pattern: string | null;
  changes: AssignWorkPatternChange[];
}

/** fn_hr_delete_work_pattern — only a never-held pattern gets here. */
export interface DeleteWorkPatternResult {
  deleted: true;
  name: string;
  weeks_removed: number;
}

export interface AssignWorkPatternResult {
  pattern_id: string | null;
  pattern_name: string | null;
  effective_from: string;
  removed: boolean;
  staff_count: number;
  staff: AssignWorkPatternStaffResult[];
}
