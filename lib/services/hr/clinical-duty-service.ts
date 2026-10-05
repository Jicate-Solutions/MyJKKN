import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  ClinicalStats,
  ClinicalDutySite,
  ClinicalEligibility,
  ClinicalEligibilityStatus,
  ClinicalPunch,
  ClinicalSiteInput,
  GrantClinicalEligibilityInput,
  RequestClinicalEligibilityInput,
} from '@/types/hr-clinical-duty';

/**
 * Clinical duty — eligibility, duty sites and today's punches.
 * Created: 2026-10-05.
 *
 * Every write is a checked `{ error }`: an RLS denial or a constraint
 * violation comes back there, not as a throw. The PUNCH itself is not here — it
 * goes through /api/hr/attendance/clinical/punch so the day can be re-judged by
 * the shift-timing evaluator (TypeScript) right after the database accepts it.
 * Decisions go through fn_hr_clinical_decide / fn_hr_clinical_revoke, which
 * check hr.attendance.clinical.manage themselves.
 */

const ELIGIBILITY_SELECT = `
  id, scope_type, employee_id, department_id, institution_id, status, reason,
  valid_from, valid_until, site_ids, requested_by, granted_directly,
  decided_at, decision_note, revoked_at, revoke_reason, created_at,
  employee:staff!employee_id(id, first_name, last_name, staff_id),
  department:departments!department_id(id, department_name),
  institution:institutions!institution_id(id, name)
`;

export class ClinicalDutyService {
  // ── Eligibility ────────────────────────────────────────────────────────────

  /** Admin list. RLS shows a non-manager only their own rows. */
  static async listEligibilities(
    supabase: SupabaseClient,
    filters: { status?: ClinicalEligibilityStatus; institutionId?: string } = {}
  ): Promise<ClinicalEligibility[]> {
    let q = supabase
      .from('hr_clinical_duty_eligibilities')
      .select(ELIGIBILITY_SELECT)
      .order('created_at', { ascending: false });
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.institutionId) q = q.eq('institution_id', filters.institutionId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as ClinicalEligibility[];
  }

  /** This person's own requests/grants, newest first. */
  static async listForStaff(
    supabase: SupabaseClient,
    employeeId: string
  ): Promise<ClinicalEligibility[]> {
    const { data, error } = await supabase
      .from('hr_clinical_duty_eligibilities')
      .select(ELIGIBILITY_SELECT)
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as ClinicalEligibility[];
  }

  /** A staff member asks for eligibility. RLS pins it to their own pending row. */
  static async request(supabase: SupabaseClient, input: RequestClinicalEligibilityInput) {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error('Sign in again to continue.');

    const { error } = await supabase.from('hr_clinical_duty_eligibilities').insert({
      scope_type: 'staff',
      employee_id: input.employeeId,
      institution_id: input.institutionId,
      status: 'pending',
      reason: input.reason.trim(),
      requested_by: uid,
      granted_directly: false,
    });
    if (error) throw error;
  }

  /**
   * HR Admin grants straight away (staff, department or whole institution).
   * Stored approved + granted_directly; decided_by/at are stamped so the record
   * reads like any other decision.
   */
  static async grant(supabase: SupabaseClient, input: GrantClinicalEligibilityInput) {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error('Sign in again to continue.');

    const { error } = await supabase.from('hr_clinical_duty_eligibilities').insert({
      scope_type: input.scopeType,
      employee_id: input.scopeType === 'staff' ? (input.employeeId ?? null) : null,
      department_id: input.scopeType === 'department' ? (input.departmentId ?? null) : null,
      institution_id: input.institutionId,
      status: 'approved',
      reason: input.reason?.trim() || null,
      valid_from: input.validFrom,
      valid_until: input.validUntil || null,
      site_ids: input.siteIds && input.siteIds.length > 0 ? input.siteIds : null,
      requested_by: uid,
      granted_directly: true,
      decided_by: uid,
      decided_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  static async decide(
    supabase: SupabaseClient,
    id: string,
    approve: boolean,
    note?: string | null
  ) {
    const { error } = await supabase.rpc('fn_hr_clinical_decide', {
      p_id: id,
      p_approve: approve,
      p_note: note ?? null,
    });
    if (error) throw error;
  }

  static async revoke(supabase: SupabaseClient, id: string, reason: string) {
    const { error } = await supabase.rpc('fn_hr_clinical_revoke', {
      p_id: id,
      p_reason: reason,
    });
    if (error) throw error;
  }

  // ── Duty sites ─────────────────────────────────────────────────────────────

  static async listSites(
    supabase: SupabaseClient,
    institutionId?: string
  ): Promise<ClinicalDutySite[]> {
    let q = supabase
      .from('hr_clinical_duty_sites')
      .select('id, institution_id, name, lat, lng, radius_m, is_active, created_at')
      .order('name');
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as ClinicalDutySite[];
  }

  static async createSite(supabase: SupabaseClient, input: ClinicalSiteInput) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('hr_clinical_duty_sites').insert({
      institution_id: input.institutionId,
      name: input.name.trim(),
      lat: input.lat,
      lng: input.lng,
      radius_m: input.radiusM,
      created_by: auth.user?.id ?? null,
    });
    if (error) throw error;
  }

  static async updateSite(
    supabase: SupabaseClient,
    id: string,
    patch: Partial<Pick<ClinicalSiteInput, 'name' | 'lat' | 'lng'>> & {
      radiusM?: number;
      isActive?: boolean;
    }
  ) {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.lat !== undefined) row.lat = patch.lat;
    if (patch.lng !== undefined) row.lng = patch.lng;
    if (patch.radiusM !== undefined) row.radius_m = patch.radiusM;
    if (patch.isActive !== undefined) row.is_active = patch.isActive;
    const { error } = await supabase.from('hr_clinical_duty_sites').update(row).eq('id', id);
    if (error) throw error;
  }

  /** HR Head / super admin only (fn_hr_clinical_delete_site checks the key). */
  static async deleteSite(supabase: SupabaseClient, id: string) {
    const { error } = await supabase.rpc('fn_hr_clinical_delete_site', { p_id: id });
    if (error) throw error;
  }

  static async stats(supabase: SupabaseClient, institutionId?: string): Promise<ClinicalStats> {
    const { data, error } = await supabase.rpc('fn_hr_clinical_stats', {
      p_institution_id: institutionId ?? null,
    });
    if (error) throw error;
    return data as ClinicalStats;
  }

  // ── Self: am I eligible today, where may I punch, what have I punched ──────

  /** Is this person approved for clinical duty on `date` (yyyy-MM-dd)? */
  static async isEligible(
    supabase: SupabaseClient,
    employeeId: string,
    date: string
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_hr_clinical_eligible', {
      p_employee_id: employeeId,
      p_date: date,
    });
    if (error) throw error;
    return data === true;
  }

  static async allowedSites(
    supabase: SupabaseClient,
    employeeId: string,
    date: string
  ): Promise<ClinicalDutySite[]> {
    const { data, error } = await supabase.rpc('fn_hr_clinical_allowed_sites', {
      p_employee_id: employeeId,
      p_date: date,
    });
    if (error) throw error;
    return (data ?? []) as unknown as ClinicalDutySite[];
  }

  static async punchesOn(
    supabase: SupabaseClient,
    employeeId: string,
    date: string
  ): Promise<ClinicalPunch[]> {
    const { data, error } = await supabase
      .from('hr_clinical_punches')
      .select('id, employee_id, work_date, punch_type, punched_at, site_id, lat, lng, accuracy_m, distance_m')
      .eq('employee_id', employeeId)
      .eq('work_date', date)
      .order('punched_at');
    if (error) throw error;
    return (data ?? []) as unknown as ClinicalPunch[];
  }
}
