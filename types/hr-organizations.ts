/**
 * HR module inclusion, per institution.
 *
 * The second axis of "who is in HR". The first is
 * employment_categories.included_in_hr, which filters staff by CATEGORY; this
 * one excludes whole institutions. They are ANDed everywhere — a staff member
 * is in HR only if both their category and their institution are.
 */

export interface HROrganizationAdminRow {
  hr_organization_id: string;
  institution_id: string;
  institution_name: string;
  /** False hides this institution from every HR surface and turns off its staff's HR self-service. */
  included_in_hr: boolean;
  /** Every active staff member, regardless of category. */
  total_staff: number;
  /** Active staff whose CATEGORY is in HR — who would actually appear in HR. */
  hr_staff: number;
  /**
   * Leave requests awaiting a decision. Excluding freezes these rather than
   * resolving them, so this is the number that becomes unreachable — shown
   * before the toggle, not after.
   */
  pending_requests: number;
  changed_at: string | null;
  changed_by_name: string | null;
  reason: string | null;
}

export interface HROrganizationSetIncludedPayload {
  hr_organization_id: string;
  included: boolean;
  reason: string;
}
