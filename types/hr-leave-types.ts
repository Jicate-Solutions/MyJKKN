/**
 * HR Leave Types — staff leave catalog.
 *
 * Backed by the hr_leave_types TABLE (not the old view over leave_types).
 * Keys on hr_organization_id, not institution_id — the org↔institution
 * mapping is 1:1 and resolving it here removes the translation the apply
 * page used to perform.
 */

// LeaveDurationType already exists at types/hr.ts:237 and is used by
// hr_leave_applications. Re-export rather than redeclaring — two independent
// unions of the same four values drift the moment one is edited.
export type { LeaveDurationType } from '@/types/hr';
import type { LeaveDurationType } from '@/types/hr';

export type LeaveAccrualType = 'none' | 'annual' | 'monthly';
export type LeaveApplicableGender = 'all' | 'male' | 'female';

/**
 * Which Time Off tab a type is requested from.
 *
 * Stored on the row rather than derived in the UI: 11 organizations each
 * maintain their own catalog, so hardcoding leave_type_code in React would
 * break the first time one of them adds a type. Admins set this on
 * /hr/admin/leave-types.
 *
 * Declared in types/hr.ts and re-exported here — hr.ts cannot import from this
 * module without the two becoming circular.
 */
export type { LeaveRequestCategory } from '@/types/hr';
import type { LeaveRequestCategory } from '@/types/hr';

export interface HRLeaveType {
  id: string;
  hr_organization_id: string;
  leave_type_code: string;
  leave_type_name: string;
  description: string | null;
  color_code: string;
  display_order: number;
  is_active: boolean;

  request_category: LeaveRequestCategory;

  // Short Time Off caps. Ignored for other request categories.
  sto_limit_mode: StoLimitMode;
  sto_limit_period: StoLimitPeriod;
  sto_max_requests: number | null;
  sto_total_minutes: number | null;
  sto_min_minutes: number | null;
  sto_max_minutes: number | null;

  // Per-period cap for day-based leave — "at most 2 Casual Leave days a month".
  // Sits alongside the annual entitlement rather than replacing it: 12 a year
  // AND no more than 2 in any one month. NULL period means no monthly throttle.
  // Ignored for short_time_off and compensatory_off.
  leave_limit_period: LeaveLimitPeriod | null;
  leave_max_days_per_period: number | null;

  duration_type: LeaveDurationType;
  allow_half_day: boolean;
  allow_hourly: boolean;

  skip_weekends: boolean;
  skip_holidays: boolean;

  requires_approval: boolean;
  is_paid: boolean;
  min_advance_notice_days: number;
  max_continuous_days: number | null;
  requires_documents: boolean;
  document_required_after_days: number | null;
  default_entitled_days: number;

  valid_from: string;
  valid_until: string | null;
  superseded_by: string | null;

  allow_carry_forward: boolean;
  max_carry_forward_days: number | null;
  is_encashable: boolean;
  max_encashable_days: number | null;
  accrual_type: LeaveAccrualType;
  accrual_rate: number;
  applicable_gender: LeaveApplicableGender;
  applicable_cadre_ids: string[] | null;

  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type HRLeaveTypeInsert = Omit<
  HRLeaveType,
  'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
> & { id?: string };

export type HRLeaveTypeUpdate = Partial<
  Omit<HRLeaveType, 'id' | 'hr_organization_id' | 'created_at' | 'updated_at'>
>;

export interface HRLeaveTypeFilters {
  hr_organization_id?: string;
  is_active?: boolean;
  search?: string;
  request_category?: LeaveRequestCategory;
}

export const REQUEST_CATEGORY_LABELS: Record<LeaveRequestCategory, string> = {
  leave: 'Leave',
  short_time_off: 'Short Time Off',
  compensatory_off: 'Compensatory Off',
};

export const REQUEST_CATEGORY_HINTS: Record<LeaveRequestCategory, string> = {
  leave: 'Full or half-day absences booked against an annual entitlement — Casual, Vacation, On-Duty, Half Pay.',
  short_time_off: 'Hourly in-day requests such as Permission. Applied with a start and end time.',
  compensatory_off: 'Time off earned by working a holiday or week-off, rather than granted annually.',
};

export const ACCRUAL_TYPE_LABELS: Record<LeaveAccrualType, string> = {
  none: 'No accrual (granted up-front)',
  annual: 'Annual',
  monthly: 'Monthly',
};

export const APPLICABLE_GENDER_LABELS: Record<LeaveApplicableGender, string> = {
  all: 'All staff',
  male: 'Male only',
  female: 'Female only',
};

/**
 * Short Time Off limits.
 *
 * These exist because hr_calc_leave_days returns a fixed 0.125 days for every
 * hourly request, so a 30-minute and a 4-hour Permission were indistinguishable
 * and default_entitled_days could not express a real cap. Short Time Off is now
 * measured in minutes and request counts instead of days.
 */
export type StoLimitMode = 'none' | 'request_count' | 'total_duration';

/**
 * The period vocabulary both cap systems share.
 *
 * Declared once and aliased rather than written out twice: Short Time Off and
 * day-based leave both resolve their window through the same
 * hr_leave_period_window() function, so two independent unions of the same four
 * values would drift the moment one is edited — the same reasoning that keeps
 * LeaveDurationType re-exported from types/hr.ts at the top of this file.
 */
export type LimitPeriod = 'month' | 'quarter' | 'half_year' | 'year';
export type StoLimitPeriod = LimitPeriod;
export type LeaveLimitPeriod = LimitPeriod;

export const STO_LIMIT_MODE_LABELS: Record<StoLimitMode, string> = {
  'none': 'No limit',
  'request_count': 'Limit by number of requests',
  'total_duration': 'Limit by total duration',
};

export const STO_LIMIT_MODE_HINTS: Record<StoLimitMode, string> = {
  'none': 'Requests are unrestricted apart from approval.',
  'request_count': 'Caps how MANY requests may be raised in each period, regardless of their length.',
  'total_duration': 'Caps the TOTAL time taken across the period, regardless of how many requests it is split into.',
};

export const LIMIT_PERIOD_LABELS: Record<LimitPeriod, string> = {
  'month': 'Per month',
  'quarter': 'Per quarter',
  'half_year': 'Per half year',
  'year': 'Per year',
};

/** Alias kept so existing Short Time Off call sites read naturally. */
export const STO_LIMIT_PERIOD_LABELS = LIMIT_PERIOD_LABELS;

/**
 * Quarter, half-year and year run from the institution's academic year start,
 * matching how leave balances already reset. Month is the calendar month.
 */
export const STO_LIMIT_PERIOD_HINT =
  'Quarter, half year and year run from the academic year start, like leave balances. Month is the calendar month.';

/** Usage in the current period, from hr_sto_usage(). */
export interface StoUsage {
  limit_mode: StoLimitMode;
  /**
   * The period could not be resolved, so the database refuses submissions.
   * Reported explicitly rather than as limit_mode 'none' — telling someone
   * they are unlimited while every submission is blocked is the worse lie.
   */
  window_unresolved?: boolean;
  limit_period?: StoLimitPeriod;
  /** Which rule supplied these limits: the type, or an assignment scope. */
  source?: 'type' | 'organization' | 'department' | 'staff';
  period_start?: string;
  period_end?: string;
  max_requests?: number | null;
  total_minutes?: number | null;
  min_minutes?: number | null;
  max_minutes?: number | null;
  requests_used?: number;
  minutes_used?: number;
  requests_left?: number | null;
  minutes_left?: number | null;
}

/**
 * Per-period leave usage, from hr_leave_period_usage().
 *
 * `limited` is false when the type carries no per-period cap — the annual
 * entitlement still applies and is read from hr_leave_balances as before.
 */
export interface LeavePeriodUsage {
  limited: boolean;
  /**
   * The period could not be resolved, so the trigger refuses every submission.
   * Reported explicitly: telling someone they are within their limit while the
   * database rejects them is the worse lie.
   */
  window_unresolved?: boolean;
  limit_period?: LeaveLimitPeriod;
  period_start?: string;
  period_end?: string;
  max_days?: number;
  days_used?: number;
  days_left?: number;
}

// ---------------------------------------------------------------------------
// Leave approval flows — hr_approval_flows WHERE flow_for = 'leave_approval'
// ---------------------------------------------------------------------------
//
// One row per (organization, leave type), plus one org-wide catch-all whose
// conditions carry no leave_type_id. LeaveService.buildApprovalChain() picks the
// most specific match and FREEZES it onto the application, so editing a flow
// never rewrites in-flight requests.

/** A step's approver is either a role or one named person — never both. */
export type LeaveApproverMode = 'role' | 'user';

/** Where a flow's steps come from. Independent of how they RUN. */
export type LeaveFlowStepSource = 'explicit' | 'role_ladder';

/**
 * How the steps run. 'parallel' is not carried on the frozen chain — the
 * builder emits ONE step holding every approver, so `current_step` keeps its
 * meaning and nothing downstream needs a second completion rule.
 */
export type LeaveFlowRunMode = 'sequential' | 'parallel';

/** 'any' = the first approver decides it; 'all' = every entry must be satisfied. */
export type LeaveStepQuorum = 'any' | 'all';

/**
 * One approver slot on a step. Exactly one of role/user is meaningful; a role
 * entry admits any holder of it inside the application's own HR organisation,
 * a pinned entry admits that person from anywhere.
 */
export interface LeaveApproverEntry {
  approver_role: string | null;
  /** profiles.id — an AUTH UID, never a staff.id. */
  approver_user_id: string | null;
  approver_name: string | null;
}

/** Ladder rung -> the roles above it, as resolved by hr_resolve_leave_ladder(). */
export interface LeaveLadderPreviewRow {
  role_key: string;
  role_name: string;
  chain: string[];
}

export interface LeaveApprovalFlowStep {
  chain_order: number;
  /**
   * Every approver on this step. ABSENT on the 23 legacy flows, which carry a
   * single approver in the sibling fields below — readApprovers() normalises
   * both shapes so no caller has to know which it is holding.
   */
  approvers?: LeaveApproverEntry[];
  /** Absent means 'any', which is what a one-approver step has always meant. */
  quorum?: LeaveStepQuorum;
  /** 'review' passes to the next step; 'final' grants approval. Last step must be final. */
  step_type: 'review' | 'final';
  /**
   * A custom_roles.role_key, or a placeholder such as 'hr_approver'.
   * trg_hla_approver_gate enforces a key that exists in custom_roles and
   * ignores one that does not — an unrecognised value means "any permitted
   * approver", which is what keeps the 14 seeded flows working.
   */
  approver_role: string;
  /**
   * profiles.id — an AUTH UID, never a staff.id. assertCanDecide() resolves the
   * caller through staff.profile_id and the gate trigger compares auth.uid(),
   * so a staff id here would save cleanly and then match nobody.
   */
  approver_user_id: string | null;
  /** Display label for a pinned person, so the chain reads without a lookup. */
  approver_name: string | null;
  escalate_after_hours: number;
}

export interface LeaveApprovalFlow {
  id: string;
  hr_organization_id: string;
  flow_name: string;
  /** `{ leave_type_id }` for a per-type flow; `{}` for the org catch-all. */
  conditions: { leave_type_id?: string } | null;
  steps: LeaveApprovalFlowStep[];
  is_active: boolean;
  escalate_after_hours: number;
  /** Defaults to 'explicit' in the database, so a legacy flow reads unchanged. */
  step_source?: LeaveFlowStepSource;
  /** Defaults to 'sequential' in the database. */
  run_mode?: LeaveFlowRunMode;
  /** Ordered role_keys, LOWEST rung first. Only read when step_source='role_ladder'. */
  role_ladder?: string[];
  /**
   * Used ONLY when the ladder yields nobody — i.e. the person at the top of the
   * ladder applying for their own leave. Without it their chain would be empty
   * and the request would be approved with no approver on record.
   */
  fallback_approver?: LeaveApproverEntry | null;
}

/** From hr_leave_approver_role_options(). */
export interface LeaveApproverRoleOption {
  role_key: string;
  role_name: string;
  user_count: number;
  /**
   * Whether the role's permissions JSONB grants hr.leave.approve. A step routed
   * to a role without it is a dead end — the gate trigger lets that person past
   * but hla_update then refuses the write.
   */
  grants_approve: boolean;
}

/** From hr_leave_approver_candidates(). */
export interface LeaveApproverCandidate {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  /**
   * Which institution this person belongs to. The picker spans every
   * institution the caller can access, so without this two people with similar
   * names are indistinguishable.
   */
  institution_name: string | null;
  role_names: string | null;
  can_approve: boolean;
}

export const LEAVE_APPROVER_MODE_LABELS: Record<LeaveApproverMode, string> = {
  role: 'Anyone holding a role',
  user: 'One named person',
};

/** 90 -> "1h 30m", 45 -> "45m". Minutes are the stored unit. */
export function formatMinutes(mins: number | null | undefined): string {
  if (mins === null || mins === undefined || !Number.isFinite(mins)) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
