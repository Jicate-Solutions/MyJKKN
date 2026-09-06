/**
 * Per-person leave entitlement exceptions.
 *
 * The leave type carries the number everyone gets; a row here is the rare,
 * explicit departure from it (maternity policy, a mid-year joiner on
 * pro-rata, a contract term). `reason` is NOT NULL in the database — an
 * unexplained exception cannot be maintained by whoever inherits it.
 */

export interface HRLeaveEntitlementOverride {
  id: string;
  employee_id: string;
  leave_type_id: string;
  hr_academic_year_id: string;
  hr_organization_id: string;
  entitled_days: number;
  reason: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Joined shape for the Exceptions table — names resolved for display. */
export interface HRLeaveEntitlementOverrideWithNames extends HRLeaveEntitlementOverride {
  staff_name: string;
  staff_code: string | null;
  leave_type_name: string;
  /** The leave type's number, so the UI can show "15 (policy: 12)". */
  default_entitled_days: number;
  year_name: string;
}

export type HRLeaveEntitlementOverrideInsert = Omit<
  HRLeaveEntitlementOverride,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>;

export type HRLeaveEntitlementOverrideUpdate = Partial<
  Pick<HRLeaveEntitlementOverride, 'entitled_days' | 'reason'>
>;

export interface HRLeaveOverrideFilters {
  hrAcademicYearId?: string;
  hrOrganizationId?: string;
  employeeId?: string;
}
