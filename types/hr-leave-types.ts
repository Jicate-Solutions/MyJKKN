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
