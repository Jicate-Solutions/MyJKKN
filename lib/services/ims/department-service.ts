// lib/services/ims/department-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface ImsDepartmentOption {
  id: string;
  department_name: string;
  department_code: string;
}

/**
 * IMS-scoped department reader.
 *
 * Reads directly from the local Supabase `departments` table so IMS dropdowns
 * (indents, transfers, etc.) keep working when the JKKN upstream API is
 * unreachable or its key is missing. The global `DepartmentService.getDepartments`
 * remains JKKN-backed for academic/billing modules that need the canonical list.
 */
export class ImsDepartmentService {
  private static get supabase() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * Active departments for a select/dropdown, scoped to one institution when
   * provided. Returns an empty array (not throw) on no-rows; throws on real
   * Supabase errors so React Query surfaces an `isError` state.
   */
  static async getDepartmentsForSelect(
    institutionId?: string | null
  ): Promise<ImsDepartmentOption[]> {
    let query = this.supabase
      .from('departments')
      .select('id, department_name, department_code')
      .eq('is_active', true)
      .order('department_order', { ascending: true })
      .order('department_name', { ascending: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        '[ImsDepartmentService] getDepartmentsForSelect failed',
        error
      );
      throw error;
    }

    return (data ?? []) as ImsDepartmentOption[];
  }
}
