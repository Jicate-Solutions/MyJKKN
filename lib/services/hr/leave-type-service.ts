/**
 * HR Leave Types service.
 *
 * Static class, SupabaseClient passed as first argument — mirrors
 * ShiftService / RecruitmentJobsService.
 *
 * Supabase errors are plain objects, not Error instances, so every call
 * destructures { error } and throws it. try/catch alone does NOT surface RLS
 * denials or constraint violations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRLeaveType,
  HRLeaveTypeFilters,
  HRLeaveTypeInsert,
  HRLeaveTypeUpdate,
} from '@/types/hr-leave-types';

export interface GenerateBalancesResult {
  dry_run: boolean;
  created: number;
  skipped: number;
  prior_year_id: string | null;
  fallback_count: number;
  fallback: Array<{ staff_code: string; name: string; reason: string }>;
}

export class HRLeaveTypeService {
  static async list(
    supabase: SupabaseClient,
    filters: HRLeaveTypeFilters = {}
  ): Promise<HRLeaveType[]> {
    let query = supabase
      .from('hr_leave_types')
      .select('*')
      .order('display_order', { ascending: true })
      .order('leave_type_name', { ascending: true });

    // `??` not `||` — `||` coerces undefined to '' which is sent as a real
    // uuid parameter and matches zero rows.
    if (filters.hr_organization_id != null) {
      query = query.eq('hr_organization_id', filters.hr_organization_id);
    }
    if (filters.is_active != null) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters.search) {
      query = query.or(
        `leave_type_name.ilike.%${filters.search}%,leave_type_code.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HRLeaveType[];
  }

  static async create(
    supabase: SupabaseClient,
    payload: HRLeaveTypeInsert
  ): Promise<HRLeaveType> {
    const { data, error } = await supabase
      .from('hr_leave_types')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveType;
  }

  static async update(
    supabase: SupabaseClient,
    id: string,
    patch: HRLeaveTypeUpdate
  ): Promise<HRLeaveType> {
    const { data, error } = await supabase
      .from('hr_leave_types')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveType;
  }

  /**
   * Soft-archive. Hard delete is intentionally not exposed: hr_leave_balances
   * and hr_leave_applications FK to this table, so removing a type in use
   * would either fail or orphan history.
   */
  static async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('hr_leave_types')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  }

  static async generateBalances(
    supabase: SupabaseClient,
    hrOrgId: string,
    academicYearId: string,
    dryRun: boolean
  ): Promise<GenerateBalancesResult> {
    const { data, error } = await supabase.rpc('generate_hr_leave_balances', {
      p_hr_org_id: hrOrgId,
      p_academic_year_id: academicYearId,
      p_dry_run: dryRun,
    });
    if (error) throw error;
    return data as GenerateBalancesResult;
  }
}
