/**
 * HR Person Service — unified view over staff (full-time) + hr_employees (guest/student_ta/vendor)
 *
 * Architecture:
 * - Full-time → query staff JOIN hr_staff_details
 * - Non-staff types → query hr_employees directly
 * - List endpoint returns a UNION via HRPersonView
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRPersonFilters,
  HRPersonListResponse,
  HRPersonView,
  HRStaffDetails,
  HREmployee,
  HREmployeeInsert,
  HRNonStaffEmploymentType,
} from '@/types/hr';

export class HRPersonService {
  /**
   * List unified view: staff (full-time) ∪ hr_employees (non-staff types).
   * RLS enforces tenant isolation on both tables.
   */
  static async list(
    supabase: SupabaseClient,
    filters: HRPersonFilters = {}
  ): Promise<HRPersonListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;

    const { search, employment_type, hr_organization_id, cadre_id, designation_id, department_id, is_active, include_staff } = filters;

    // ── Branch A: Full-time via staff + hr_staff_details ────────
    // Skipped entirely when include_staff is explicitly false (the /hr/employees
    // page passes this so it shows ONLY guests / vendors / TAs / volunteers —
    // full-time staff are managed at /staff/list and showing them in both URLs
    // was the duplication users were calling out).
    const includeFullTime =
      include_staff !== false &&
      (!employment_type || employment_type === 'full_time');
    // ── Branch B: Non-staff via hr_employees ────────────────────
    const includeNonStaff = !employment_type || employment_type !== 'full_time';

    const people: HRPersonView[] = [];

    if (includeFullTime) {
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
    }

    if (includeNonStaff) {
      let q = supabase
        .from('hr_employees')
        .select(
          `
            *,
            organization:hr_organization_id (id, name),
            designation:designation_id (id, name),
            cadre:cadre_id (id, name)
          `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false });

      if (hr_organization_id) q = q.eq('hr_organization_id', hr_organization_id);
      if (employment_type && employment_type !== 'full_time') q = q.eq('employment_type', employment_type);
      if (cadre_id) q = q.eq('cadre_id', cadre_id);
      if (designation_id) q = q.eq('designation_id', designation_id);
      if (is_active !== undefined) q = q.eq('is_active', is_active);
      if (search) {
        const s = `%${search}%`;
        q = q.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},employee_code.ilike.${s}`);
      }

      const { data, error } = await q;
      if (error) throw error;

      for (const emp of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        people.push({
          source: 'hr_employees',
          id: emp.id as string,
          hr_employee_id: emp.id as string,
          hr_organization_id: emp.hr_organization_id as string,
          organization_name: (emp.organization as { name?: string } | undefined)?.name ?? null,
          employment_type: emp.employment_type as HRNonStaffEmploymentType,
          employee_code: (emp.employee_code as string | null) ?? null,
          first_name: emp.first_name as string,
          last_name: (emp.last_name as string | null) ?? null,
          email: (emp.email as string | null) ?? null,
          phone: (emp.phone as string | null) ?? null,
          designation_name: (emp.designation as { name?: string } | undefined)?.name ?? null,
          cadre_name: (emp.cadre as { name?: string } | undefined)?.name ?? null,
          department_id: null,
          date_of_joining: null,
          is_active: (emp.is_active as boolean | null) ?? true,
        });
      }
    }

    // Sort unified list by name and paginate in-memory (Sprint 1 — fine at 393 rows; move to RPC for scale)
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

  /** Create a non-staff HR employee (guest / student_ta / vendor_monitored). */
  static async createNonStaffEmployee(
    supabase: SupabaseClient,
    input: HREmployeeInsert
  ): Promise<HREmployee> {
    const { data, error } = await supabase.from('hr_employees').insert(input).select().single();
    if (error) throw error;
    return data as HREmployee;
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

  /** Fetch a single hr_employees row with joins. */
  static async getNonStaffEmployee(
    supabase: SupabaseClient,
    id: string
  ) {
    const { data, error } = await supabase
      .from('hr_employees')
      .select(`*, organization:hr_organization_id (id, name), designation:designation_id (id, name), cadre:cadre_id (id, name)`)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Soft-delete a non-staff HR employee. */
  static async deactivateNonStaff(
    supabase: SupabaseClient,
    id: string,
    reason: string
  ): Promise<HREmployee> {
    const { data, error } = await supabase
      .from('hr_employees')
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivation_reason: reason,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HREmployee;
  }
}

// Backwards-compat re-export (legacy imports used HREmployeeService name; kept until callers updated)
export const HREmployeeService = HRPersonService;
