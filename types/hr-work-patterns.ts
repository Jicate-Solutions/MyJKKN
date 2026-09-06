/**
 * HR Work Patterns — TypeScript contracts.
 * Created: 2026-09-04.
 *
 * Mirrors supabase/migrations/20260904120000_hr_work_patterns.sql.
 *
 * A work pattern is an institution-scoped, named working week (which weekdays,
 * which hours) with its own days-per-leave-type. Its hours are ordinary
 * hr_shift_timings rows with staff_scope = 'work_pattern'; who is on it is an
 * effective-dated assignment. For an assigned person the pattern is EXCLUSIVE:
 * the resolver reads its rows or nothing, never the institution week.
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

/** A pattern as listed: its row plus what the week, members and figures look like. */
export interface WorkPatternSummary extends HRWorkPattern {
  /** For the "All institutions" listing; null only if the join was unreadable. */
  institution_name: string | null;
  /** From the week in force on `asOf`; empty when no week has been saved yet. */
  working_days: IsoDayOfWeek[];
  first_half_start: string | null;
  second_half_end: string | null;
  week_effective_from: string | null;
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
  week_rows_removed: number;
}

export interface AssignWorkPatternResult {
  pattern_id: string | null;
  pattern_name: string | null;
  effective_from: string;
  removed: boolean;
  staff_count: number;
  staff: AssignWorkPatternStaffResult[];
}
