/**
 * Clinical duty — geotagged attendance for HR-approved off-campus staff.
 * Created: 2026-10-05. Tables: hr_clinical_duty_sites,
 * hr_clinical_duty_eligibilities, hr_clinical_punches.
 */

export type ClinicalScope = 'staff' | 'department' | 'institution';
export type ClinicalEligibilityStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
export type ClinicalPunchType = 'in' | 'out';

export interface ClinicalDutySite {
  id: string;
  institution_id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  is_active: boolean;
  created_at: string;
}

export interface ClinicalEligibility {
  id: string;
  scope_type: ClinicalScope;
  employee_id: string | null;
  department_id: string | null;
  institution_id: string;
  status: ClinicalEligibilityStatus;
  reason: string | null;
  valid_from: string;
  valid_until: string | null;
  /** null = every active site of the institution. */
  site_ids: string[] | null;
  requested_by: string | null;
  granted_directly: boolean;
  decided_at: string | null;
  decision_note: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
  /** Embeds, present on the admin list only. */
  employee?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    staff_id: string | null;
  } | null;
  department?: { id: string; department_name: string | null } | null;
  institution?: { id: string; name: string | null } | null;
}

export interface ClinicalPunch {
  id: string;
  employee_id: string;
  work_date: string;
  punch_type: ClinicalPunchType;
  punched_at: string;
  site_id: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  distance_m: number;
}

/** What fn_hr_clinical_punch returns. */
export interface ClinicalPunchResult {
  employee_id: string;
  work_date: string;
  punch_type: ClinicalPunchType;
  punched_at: string;
  site_name: string;
  distance_m: number;
}

/** What fn_hr_clinical_stats returns. */
export interface ClinicalStats {
  requests: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    revoked: number;
    active_now: number;
    expiring_30d: number;
    direct_grants: number;
    oldest_pending_days: number;
    avg_decision_hours: number | null;
  };
  by_scope: Partial<Record<ClinicalScope, number>>;
  by_institution: Array<{
    id: string;
    name: string;
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    revoked: number;
  }>;
  by_month: Array<{ month: string; label: string; requests: number }>;
  punches: {
    today_in: number;
    today_out: number;
    on_duty_now: number;
    month_days: number;
    month_staff: number;
    month_missing_out: number;
  };
  sites: { active: number; inactive: number };
}

export interface RequestClinicalEligibilityInput {
  employeeId: string;
  institutionId: string;
  reason: string;
}

export interface GrantClinicalEligibilityInput {
  scopeType: ClinicalScope;
  institutionId: string;
  employeeId?: string | null;
  departmentId?: string | null;
  validFrom: string;
  validUntil?: string | null;
  siteIds?: string[] | null;
  reason?: string | null;
}

export interface ClinicalSiteInput {
  institutionId: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}
