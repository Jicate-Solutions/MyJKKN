/**
 * HR Person Service — unified view over staff + hr_staff_details.
 *
 * Architecture (post-consolidation):
 * - All employee types now live in the staff table.
 * - hr_employees table has been dropped (see migration
 *   20260524083600_consolidate_hr_employees_to_staff.sql).
 * - Full-time → query staff JOIN hr_staff_details
 * - Non-staff types (guest, student_ta, vendor_monitored, unpaid_volunteer)
 *   also use staff + hr_staff_details.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRPersonFilters,
  HRPersonListResponse,
  HRPersonView,
  HRStaffDetails,
} from '@/types/hr';

export class HRPersonService {
  /**
   * List unified view: all employees from staff + hr_staff_details.
   * RLS enforces tenant isolation.
   */
  static async list(
    supabase: SupabaseClient,
    filters: HRPersonFilters = {}
  ): Promise<HRPersonListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const {
      search, hr_organization_id, cadre_id, designation_id,
      department_id, institution_id, is_active,
    } = filters;

    // HR-specific filters require an hr_staff_details row to exist, so the embed
    // becomes an INNER join only when one is active. Default is a LEFT join so
    // ALL staff appear — including the ~300 with no hr_staff_details row.
    const hrFilterActive = Boolean(hr_organization_id || cadre_id || designation_id);
    const detailsJoin = hrFilterActive
      ? 'hr_staff_details!hr_staff_details_staff_id_fkey!inner'
      : 'hr_staff_details!hr_staff_details_staff_id_fkey';

    let q = supabase
      .from('staff')
      .select(
        `
          id, first_name, last_name, institution_email, phone, staff_id, department_id,
          date_of_joining, is_active, institution_id, profile_id,
          biometric_id, biometric_institution_id,
          institution:institutions!staff_institution_id_fkey ( id, name ),
          department:departments ( id, department_name ),
          employment_categories!inner ( included_in_hr ),
          ${detailsJoin} (
            staff_id, hr_organization_id, designation_id, cadre_id, hr_employee_code,
            organization:hr_organization_id ( id, name ),
            designation:designation_id ( id, name ),
            cadre:cadre_id ( id, name )
          )
        `,
        { count: 'exact' }
      );

    // This is the HR employee directory, so it lists the HR population only.
    // The !inner embed above does the filtering; dropping staff whose category
    // is excluded is the intent, not the usual silent-row-loss hazard.
    q = q.eq('employment_categories.included_in_hr', true);

    if (institution_id) q = q.eq('institution_id', institution_id);
    if (department_id) q = q.eq('department_id', department_id);
    if (is_active !== undefined) q = q.eq('is_active', is_active);
    if (hr_organization_id) q = q.eq('hr_staff_details.hr_organization_id', hr_organization_id);
    if (cadre_id) q = q.eq('hr_staff_details.cadre_id', cadre_id);
    if (designation_id) q = q.eq('hr_staff_details.designation_id', designation_id);
    if (search) {
      const s = `%${search}%`;
      // Search spans BOTH email columns: institution_email is what the Email column
      // displays (so a visible address must be findable), while personal email stays
      // searchable for anyone who only knows that one.
      q = q.or(
        `first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},institution_email.ilike.${s},staff_id.ilike.${s}`
      );
    }

    q = q.order('first_name', { ascending: true });

    // Export mode returns every matching row (no pagination window).
    if (!filters.exportAll) {
      q = q.range(from, to);
    }

    const { data, error, count } = await q;
    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const rolesByProfile = await HRPersonService.roleNamesByProfile(
      supabase,
      rows.map((r) => r.profile_id as string | null)
    );
    const { payrollOrgByStaff, orgById, orgByInstitution } =
      await HRPersonService.fallbackOrgByStaff(
        supabase,
        rows.map((r) => r.id as string)
      );
    const institutionById = await HRPersonService.institutionNames(supabase);

    const people: HRPersonView[] = rows.map((row) => {
      const rawDetails = row.hr_staff_details;
      const details = (Array.isArray(rawDetails) ? rawDetails[0] : rawDetails) as Record<string, unknown> | undefined;
      const institution = row.institution as { name?: string } | undefined;
      const department = row.department as { department_name?: string } | undefined;

      // details -> payroll -> institution. Additive: the first branch is what
      // the column always showed, so nothing that already resolved changes.
      const detailsOrgId = (details?.hr_organization_id as string | null) ?? null;
      const detailsOrgName =
        (details?.organization as { name?: string } | undefined)?.name ?? null;
      const instOrg = orgByInstitution.get((row.institution_id as string) ?? '') ?? null;
      const orgId =
        detailsOrgId ?? payrollOrgByStaff.get(row.id as string) ?? instOrg?.id ?? null;
      const orgName = detailsOrgName ?? (orgId ? orgById.get(orgId) ?? null : null);

      return {
        source: 'staff',
        id: row.id as string,
        staff_id: row.id as string,
        staff_code: (row.staff_id as string | null) ?? null,
        hr_organization_id: orgId,
        organization_name: orgName,
        employment_type: 'full_time',
        employee_code: (details?.hr_employee_code as string | null) ?? (row.staff_id as string | null) ?? null,
        first_name: row.first_name as string,
        last_name: (row.last_name as string | null) ?? null,
        // Email column shows the institution (@jkkn.ac.in) address, not the personal one.
        // institution_email is nullable (migration 20260609150000) so NULL is expected for
        // staff without one — the table renders '—'.
        email: (row.institution_email as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        designation_name: (details?.designation as { name?: string } | undefined)?.name ?? null,
        cadre_name: (details?.cadre as { name?: string } | undefined)?.name ?? null,
        department_id: (row.department_id as string | null) ?? null,
        department_name: department?.department_name ?? null,
        role_names: rolesByProfile.get((row.profile_id as string | null) ?? '') ?? null,
        biometric_code: (row.biometric_id as string | null) ?? null,
        biometric_machine_name:
          institutionById.get((row.biometric_institution_id as string | null) ?? '') ?? null,
        institution_name: institution?.name ?? null,
        date_of_joining: (row.date_of_joining as string | null) ?? null,
        is_active: (row.is_active as boolean | null) ?? true,
      };
    });

    const total = filters.exportAll ? people.length : (count ?? 0);

    return {
      data: people,
      metadata: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / (pageSize || 1))),
      },
    };
  }

  /**
   * The HR organisation for staff whose hr_staff_details row does not name one.
   *
   * THE DIRECTORY USED TO READ hr_staff_details ALONE, so the Organization
   * column was blank for 294 of 766 active staff — including 180 who HAD been
   * assigned an organisation on /hr/payroll/organisation, which writes
   * hr_staff_payroll, a different table. "I assigned it and it doesn't show"
   * was exactly that mismatch.
   *
   * Precedence is details -> payroll -> institution, and it is ADDITIVE: a row
   * that already resolves through hr_staff_details is never overridden, so no
   * currently-correct value can change. The institution fallback mirrors what
   * fn_my_hr_context() does for the leave module (hr_organizations has one row
   * per institution).
   *
   * Returns id + name so the caller can fill both fields.
   */
  private static async fallbackOrgByStaff(
    supabase: SupabaseClient,
    staffIds: string[]
  ): Promise<{
    payrollOrgByStaff: Map<string, string>;
    orgById: Map<string, string>;
    orgByInstitution: Map<string, { id: string; name: string }>;
  }> {
    const payrollOrgByStaff = new Map<string, string>();
    const orgById = new Map<string, string>();
    const orgByInstitution = new Map<string, { id: string; name: string }>();

    // hr_organizations is ~14 rows — one unfiltered read is cheaper than
    // threading ids through, and it serves both lookups.
    const { data: orgs, error: orgErr } = await supabase
      .from('hr_organizations')
      .select('id, name, institution_id');
    if (orgErr) {
      console.error('[HRPersonService] organisation lookup failed', orgErr);
      return { payrollOrgByStaff, orgById, orgByInstitution };
    }
    for (const o of (orgs ?? []) as Array<Record<string, unknown>>) {
      const id = o.id as string;
      const name = (o.name as string | null) ?? '';
      orgById.set(id, name);
      const inst = o.institution_id as string | null;
      if (inst && !orgByInstitution.has(inst)) orgByInstitution.set(inst, { id, name });
    }

    // Chunked for the same reason as the role lookup: export mode passes every
    // matching staff member.
    const CHUNK = 200;
    for (let i = 0; i < staffIds.length; i += CHUNK) {
      const { data, error } = await supabase
        .from('hr_staff_payroll')
        .select('staff_id, hr_organization_id')
        .in('staff_id', staffIds.slice(i, i + CHUNK));
      if (error) {
        console.error('[HRPersonService] payroll organisation lookup failed', error);
        break;
      }
      for (const p of (data ?? []) as Array<Record<string, unknown>>) {
        const org = p.hr_organization_id as string | null;
        if (org) payrollOrgByStaff.set(p.staff_id as string, org);
      }
    }

    return { payrollOrgByStaff, orgById, orgByInstitution };
  }

  /**
   * Institution names by id, for the biometric machine column.
   *
   * staff.biometric_institution_id names the institution whose biometric
   * device the person is enrolled on — which is NOT always their own
   * institution, so it cannot reuse the embedded `institution` join. It also
   * carries no foreign key, so PostgREST cannot embed it at all; the id has to
   * be resolved against a lookup. Institutions are ~14 rows, so one unfiltered
   * read is cheaper than threading ids through.
   */
  private static async institutionNames(
    supabase: SupabaseClient
  ): Promise<Map<string, string>> {
    const byId = new Map<string, string>();
    const { data, error } = await supabase.from('institutions').select('id, name');
    if (error) {
      console.error('[HRPersonService] institution lookup failed', error);
      return byId;
    }
    for (const i of (data ?? []) as Array<Record<string, unknown>>) {
      byId.set(i.id as string, (i.name as string | null) ?? '');
    }
    return byId;
  }

  /**
   * Role Management role names, keyed by profile id.
   *
   * "Role" in this application means the custom_roles assignment that decides
   * what a person may do — NOT their designation. Roles hang off the profile
   * (user_roles.user_id = profiles.id = staff.profile_id), so this is a second
   * query rather than a three-level PostgREST embed
   * (staff -> profiles -> user_roles -> custom_roles): that would depend on FK
   * inference at every hop and drop rows at any hop it could not resolve.
   *
   * CHUNKED. Export mode passes every matching staff member, and a single
   * .in() with ~765 uuids builds a query string long enough to be refused.
   *
   * Inactive roles are excluded — a retired role is not something the person
   * still is.
   */
  private static async roleNamesByProfile(
    supabase: SupabaseClient,
    profileIds: Array<string | null>
  ): Promise<Map<string, string>> {
    const ids = [...new Set(profileIds.filter((v): v is string => !!v))];
    const byProfile = new Map<string, string[]>();
    const CHUNK = 200;

    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, custom_roles!inner ( role_name, is_active )')
        .in('user_id', ids.slice(i, i + CHUNK))
        .eq('custom_roles.is_active', true);

      // Roles are a display enrichment: a failure here must not blank the
      // whole directory, so it degrades to "no role" and is logged.
      if (error) {
        console.error('[HRPersonService] role lookup failed', error);
        break;
      }

      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        const embedded = r.custom_roles;
        const role = (Array.isArray(embedded) ? embedded[0] : embedded) as
          | { role_name?: string }
          | undefined;
        const name = role?.role_name?.trim();
        if (!name) continue;
        const key = r.user_id as string;
        const list = byProfile.get(key);
        if (list) list.push(name);
        else byProfile.set(key, [name]);
      }
    }

    return new Map(
      [...byProfile.entries()].map(([id, names]) => [id, [...names].sort().join(', ')])
    );
  }

  /** Fetch hr_staff_details for a JKKN staff member. */
  static async getStaffDetails(
    supabase: SupabaseClient,
    staffId: string
  ): Promise<HRStaffDetails | null> {
    const { data, error } = await supabase
      .from('hr_staff_details')
      .select('*')
      .eq('staff_id', staffId)
      .maybeSingle();
    if (error) throw error;
    return data as HRStaffDetails | null;
  }

  /** Fetch a staff member with HR details by staff.id. */
  static async getStaffMember(
    supabase: SupabaseClient,
    id: string
  ) {
    const { data, error } = await supabase
      .from('staff')
      .select(`
        *,
        hr_staff_details!hr_staff_details_staff_id_fkey (
          staff_id, hr_organization_id, designation_id, cadre_id, hr_employee_code,
          organization:hr_organization_id (id, name),
          designation:designation_id (id, name),
          cadre:cadre_id (id, name)
        )
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Enriched, name-resolved detail for one staff member (read-only HR view).
   * Returns null when the staff row is not visible under RLS.
   */
  static async getPersonDetail(
    supabase: SupabaseClient,
    id: string
  ): Promise<import('@/types/hr').HRPersonDetailView | null> {
    const { data, error } = await supabase
      .from('staff')
      .select(`
        id, first_name, last_name, institution_email, phone, staff_id, legacy_staff_id, institution_id, department_id,
        date_of_joining, is_active, profile_id,
        email, gender, date_of_birth, marital_status, blood_group,
        address, district, state, pincode, designation, employment_type,
        status, experience_years, login_enabled, bus_required, profile_picture,
        biometric_id, biometric_institution_id,
        category:employment_categories ( category_name ),
        institution:institutions!staff_institution_id_fkey ( id, name ),
        department:departments ( id, department_name ),
        hr_staff_details!hr_staff_details_staff_id_fkey (
          hr_organization_id, designation_id, cadre_id, reports_to_staff_id, hr_employee_code,
          organization:hr_organization_id ( id, name ),
          designation:designation_id ( id, name ),
          cadre:cadre_id ( id, name )
        )
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = data as Record<string, unknown>;
    const rawDetails = row.hr_staff_details;
    const d = (Array.isArray(rawDetails) ? rawDetails[0] : rawDetails) as Record<string, unknown> | undefined;

    // reports_to resolved with a separate query to avoid FK-embed ambiguity
    // (reports_to_staff_id also targets staff, which PostgREST can't
    // disambiguate against the base table without a named hint).
    let reports_to_name: string | null = null;
    const reportsToId = d?.reports_to_staff_id as string | null | undefined;
    if (reportsToId) {
      const { data: mgr } = await supabase
        .from('staff')
        .select('first_name, last_name')
        .eq('id', reportsToId)
        .maybeSingle();
      if (mgr) {
        reports_to_name = `${(mgr as any).first_name} ${(mgr as any).last_name ?? ''}`.trim();
      }
    }

    // Roles and the biometric machine reuse the list view's lookups so the
    // detail page and the table can never disagree about the same person.
    const roles = await HRPersonService.roleNamesByProfile(supabase, [
      (row.profile_id as string | null) ?? null,
    ]);
    const bioMachineId = (row.biometric_institution_id as string | null) ?? null;
    let biometric_machine_name: string | null = null;
    if (bioMachineId) {
      const institutions = await HRPersonService.institutionNames(supabase);
      biometric_machine_name = institutions.get(bioMachineId) ?? null;
    }

    return {
      id: row.id as string,
      first_name: row.first_name as string,
      last_name: (row.last_name as string | null) ?? null,
      // Institution email, matching the HR employees list column. See list() above.
      email: (row.institution_email as string | null) ?? null,
      personal_email: (row.email as string | null) ?? null,
      gender: (row.gender as string | null) ?? null,
      date_of_birth: (row.date_of_birth as string | null) ?? null,
      marital_status: (row.marital_status as string | null) ?? null,
      blood_group: (row.blood_group as string | null) ?? null,
      address: (row.address as string | null) || null,
      district: (row.district as string | null) || null,
      state: (row.state as string | null) || null,
      pincode: (row.pincode as string | null) || null,
      staff_designation: (row.designation as string | null) ?? null,
      employment_category:
        (row.category as { category_name?: string } | undefined)?.category_name ?? null,
      employment_type: (row.employment_type as string | null) ?? null,
      record_status: (row.status as string | null) ?? null,
      experience_years: (row.experience_years as number | null) ?? null,
      login_enabled: (row.login_enabled as boolean | null) ?? null,
      bus_required: (row.bus_required as boolean | null) ?? null,
      profile_picture: (row.profile_picture as string | null) ?? null,
      role_names: roles.get((row.profile_id as string | null) ?? '') ?? null,
      biometric_code: (row.biometric_id as string | null) ?? null,
      biometric_machine_name,
      phone: (row.phone as string | null) ?? null,
      staff_code: (row.staff_id as string | null) ?? null,
      // The code this person held before the 2026-08-28 renumbering. Shown so an
      // enquiry quoting an old ID off a printed record can be matched here.
      legacy_staff_code: (row.legacy_staff_id as string | null) ?? null,
      institution_name: (row.institution as { name?: string } | undefined)?.name ?? null,
      department_name: (row.department as { department_name?: string } | undefined)?.department_name ?? null,
      date_of_joining: (row.date_of_joining as string | null) ?? null,
      is_active: (row.is_active as boolean | null) ?? true,
      hr_employee_code: (d?.hr_employee_code as string | null) ?? null,
      organization_name: (d?.organization as { name?: string } | undefined)?.name ?? null,
      designation_name: (d?.designation as { name?: string } | undefined)?.name ?? null,
      cadre_name: (d?.cadre as { name?: string } | undefined)?.name ?? null,
      reports_to_name,
    };
  }
}

// Backwards-compat re-export (legacy imports used HREmployeeService name; kept until callers updated)
export const HREmployeeService = HRPersonService;
