/**
 * HR Employee Service
 *
 * Per spec v4 §5 (hr_employees table) + §7 (Phase D CRUD).
 * Handles CRUD for polymorphic hr_employees (4 types: full_time, guest, student_ta, vendor_monitored).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HREmployee,
  HREmployeeInsert,
  HREmployeeUpdate,
  HREmployeeFilters,
  HREmployeeListResponse,
  HREmployeeWithRelations,
} from '@/types/hr';

export class HREmployeeService {
  /**
   * List employees with filters + pagination.
   * RLS enforces tenant isolation (auth_hr_organization_id() OR is_super_admin()).
   */
  static async list(
    supabase: SupabaseClient,
    filters: HREmployeeFilters = {}
  ): Promise<HREmployeeListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('hr_employees')
      .select(
        `
          *,
          designation:designation_id(id, name, code, cadre_id),
          cadre:cadre_id(id, name, code),
          organization:hr_organization_id(id, name, source, institution_id)
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.hr_organization_id) {
      query = query.eq('hr_organization_id', filters.hr_organization_id);
    }
    if (filters.employment_type) {
      query = query.eq('employment_type', filters.employment_type);
    }
    if (filters.cadre_id) {
      query = query.eq('cadre_id', filters.cadre_id);
    }
    if (filters.designation_id) {
      query = query.eq('designation_id', filters.designation_id);
    }
    if (filters.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters.search) {
      const s = `%${filters.search}%`;
      query = query.or(
        `first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},employee_code.ilike.${s}`
      );
    }

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      data: (data ?? []) as HREmployeeWithRelations[],
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    };
  }

  /**
   * Get one employee by ID.
   */
  static async getById(
    supabase: SupabaseClient,
    id: string
  ): Promise<HREmployeeWithRelations | null> {
    const { data, error } = await supabase
      .from('hr_employees')
      .select(
        `
          *,
          designation:designation_id(id, name, code, cadre_id),
          cadre:cadre_id(id, name, code),
          organization:hr_organization_id(id, name, source, institution_id)
        `
      )
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as HREmployeeWithRelations | null;
  }

  /**
   * Create employee.
   * Polymorphic CHECK constraint validates the appropriate FK is present.
   */
  static async create(
    supabase: SupabaseClient,
    input: HREmployeeInsert
  ): Promise<HREmployee> {
    const { data, error } = await supabase
      .from('hr_employees')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data as HREmployee;
  }

  /**
   * Update employee (partial).
   */
  static async update(
    supabase: SupabaseClient,
    id: string,
    input: HREmployeeUpdate
  ): Promise<HREmployee> {
    const { data, error } = await supabase
      .from('hr_employees')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HREmployee;
  }

  /**
   * Soft-delete via is_active=false + deactivated_at + reason.
   * Per spec §5: no hard delete in v1.
   */
  static async deactivate(
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
