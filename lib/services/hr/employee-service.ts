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
          date_of_joining, is_active, institution_id,
          institution:institutions ( id, name ),
          department:departments ( id, department_name ),
          ${detailsJoin} (
            staff_id, hr_organization_id, designation_id, cadre_id, hr_employee_code,
            organization:hr_organization_id ( id, name ),
            designation:designation_id ( id, name ),
            cadre:cadre_id ( id, name )
          )
        `,
        { count: 'exact' }
      );

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

    const people: HRPersonView[] = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
      const rawDetails = row.hr_staff_details;
      const details = (Array.isArray(rawDetails) ? rawDetails[0] : rawDetails) as Record<string, unknown> | undefined;
      const institution = row.institution as { name?: string } | undefined;
      const department = row.department as { department_name?: string } | undefined;
      return {
        source: 'staff',
        id: row.id as string,
        staff_id: row.id as string,
        staff_code: (row.staff_id as string | null) ?? null,
        hr_organization_id: (details?.hr_organization_id as string | null) ?? null,
        organization_name: (details?.organization as { name?: string } | undefined)?.name ?? null,
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
        id, first_name, last_name, institution_email, phone, staff_id, institution_id, department_id,
        date_of_joining, is_active,
        institution:institutions ( id, name ),
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

    return {
      id: row.id as string,
      first_name: row.first_name as string,
      last_name: (row.last_name as string | null) ?? null,
      // Institution email, matching the HR employees list column. See list() above.
      email: (row.institution_email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      staff_code: (row.staff_id as string | null) ?? null,
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
