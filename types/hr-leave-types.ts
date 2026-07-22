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
export type StoLimitPeriod = 'month' | 'quarter' | 'half_year' | 'year';

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

export const STO_LIMIT_PERIOD_LABELS: Record<StoLimitPeriod, string> = {
  'month': 'Per month',
  'quarter': 'Per quarter',
  'half_year': 'Per half year',
  'year': 'Per year',
};

/**
 * Quarter, half-year and year run from the institution's academic year start,
 * matching how leave balances already reset. Month is the calendar month.
 */
export const STO_LIMIT_PERIOD_HINT =
  'Quarter, half year and year run from the academic year start, like leave balances. Month is the calendar month.';

/** Usage in the current period, from hr_sto_usage(). */
export interface StoUsage {
  limit_mode: StoLimitMode;
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

/** 90 -> "1h 30m", 45 -> "45m". Minutes are the stored unit. */
export function formatMinutes(mins: number | null | undefined): string {
  if (mins === null || mins === undefined || !Number.isFinite(mins)) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
