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

    const { search, employment_type, hr_organization_id, cadre_id, designation_id, department_id, is_active } = filters;

    const people: HRPersonView[] = [];

    // All employees now come from staff + hr_staff_details
    let q = supabase
      .from('staff')
      .select(
        `
          id, first_name, last_name, email, phone, staff_id, department_id, date_of_joining, is_active, institution_id,
          hr_staff_details!hr_staff_details_staff_id_fkey!inner (
            staff_id, hr_organization_id, designation_id, cadre_id, hr_employee_code,
            organization:hr_organization_id (id, name),
            designation:designation_id (id, name),
            cadre:cadre_id (id, name)
          )
        `,
        { count: 'exact' }
      );

    if (hr_organization_id) q = q.eq('hr_staff_details.hr_organization_id', hr_organization_id);
    if (cadre_id) q = q.eq('hr_staff_details.cadre_id', cadre_id);
    if (designation_id) q = q.eq('hr_staff_details.designation_id', designation_id);
    if (department_id) q = q.eq('department_id', department_id);
    if (is_active !== undefined) q = q.eq('is_active', is_active);
    if (search) {
      const s = `%${search}%`;
      q = q.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},staff_id.ilike.${s}`);
    }
    // employment_type filter is a no-op for now since staff doesn't have an
    // employment_type column yet. All rows are treated as full_time.
    // Future: add employment_type to hr_staff_details for non-staff types.

    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;

    for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const details = (Array.isArray(row.hr_staff_details) ? row.hr_staff_details[0] : row.hr_staff_details) as Record<string, unknown> | undefined;
      if (!details) continue;
      people.push({
        source: 'staff',
        id: row.id as string,
        staff_id: row.id as string,
        hr_organization_id: details.hr_organization_id as string,
        organization_name: (details.organization as { name?: string } | undefined)?.name ?? null,
        employment_type: 'full_time',
        employee_code: (details.hr_employee_code as string | null) ?? (row.staff_id as string | null),
        first_name: row.first_name as string,
        last_name: (row.last_name as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        designation_name: (details.designation as { name?: string } | undefined)?.name ?? null,
        cadre_name: (details.cadre as { name?: string } | undefined)?.name ?? null,
        department_id: (row.department_id as string | null) ?? null,
        date_of_joining: (row.date_of_joining as string | null) ?? null,
        is_active: (row.is_active as boolean | null) ?? true,
      });
    }

    // Sort by name and paginate in-memory (fine at 393 rows; move to RPC for scale)
    people.sort((a, b) => (a.first_name + (a.last_name ?? '')).localeCompare(b.first_name + (b.last_name ?? '')));
    const total = people.length;
    const from = (page - 1) * pageSize;
    const paginated = people.slice(from, from + pageSize);

    return {
      data: paginated,
      metadata: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
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
}

// Backwards-compat re-export (legacy imports used HREmployeeService name; kept until callers updated)
export const HREmployeeService = HRPersonService;
