/**
 * HR Recruitment Need — Data Entry Service
 *
 * Static class providing CRUD for data-entry tables:
 *   - institution_program_approvals
 *   - staff_specializations
 *   - hr_staff_institution_allocation
 *
 * Pattern: static class, SupabaseClient as first arg (matches admin-service.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InstitutionProgramApproval,
  HRStaffInstitutionAllocation,
} from '@/types/hr-recruitment-need';

// ─── Insert / Update shapes ──────────────────────────────────────────────────

export type ApprovalInsert = Omit<InstitutionProgramApproval, 'id' | 'created_at' | 'updated_at'>;
export type ApprovalUpdate = Partial<ApprovalInsert>;

export type AllocationInsert = Omit<HRStaffInstitutionAllocation, 'id' | 'created_at' | 'updated_at'>;
export type AllocationUpdate = Partial<AllocationInsert>;

export interface StaffSpecializationRow {
  id: string;
  staff_id: string;
  specialization_id: string;
  is_primary: boolean;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
}

export interface StaffSpecializationInsert {
  staff_id: string;
  specialization_id: string;
  is_primary?: boolean;
}

export interface StaffWithSpecializations {
  id: string;
  first_name: string;
  last_name: string;
  institution_id: string;
  institution_name?: string;
  specializations: Array<{
    id: string;
    specialization_id: string;
    specialization_name: string;
    is_primary: boolean;
    verified_at: string | null;
    verified_by: string | null;
  }>;
}

export interface AllocationWithStaff extends HRStaffInstitutionAllocation {
  staff_first_name?: string;
  staff_last_name?: string;
  institution_name?: string;
}

export interface ApprovalWithJoins extends InstitutionProgramApproval {
  institution_name?: string;
  program_name?: string;
  body_name?: string;
  body_abbreviation?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class DataEntryService {
  // ═══════════════════════════════════════════════════════════════════════════
  // Institution Program Approvals
  // ═══════════════════════════════════════════════════════════════════════════

  static async listApprovals(
    supabase: SupabaseClient,
    filters?: { institution_id?: string; body_id?: string }
  ): Promise<ApprovalWithJoins[]> {
    let query = supabase
      .from('institution_program_approvals')
      .select(`
        *,
        institution:institutions!institution_program_approvals_institution_id_fkey(id, name),
        program:programs!institution_program_approvals_program_id_fkey(id, name),
        body:hr_regulatory_bodies!institution_program_approvals_body_id_fkey(id, name, abbreviation)
      `)
      .order('created_at', { ascending: false });

    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters?.body_id) {
      query = query.eq('body_id', filters.body_id);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list approvals: ${error.message}`);

    return (data ?? []).map((row: Record<string, unknown>) => {
      const inst = row.institution as Record<string, unknown> | null;
      const prog = row.program as Record<string, unknown> | null;
      const body = row.body as Record<string, unknown> | null;
      return {
        id: row.id as string,
        institution_id: row.institution_id as string,
        program_id: row.program_id as string,
        body_id: row.body_id as string,
        sanctioned_faculty_count: row.sanctioned_faculty_count as number,
        approved_intake: row.approved_intake as number | null,
        approval_date: row.approval_date as string | null,
        renewal_due_date: row.renewal_due_date as string | null,
        approval_reference: row.approval_reference as string | null,
        norm_version_at_approval: row.norm_version_at_approval as string | null,
        is_active: row.is_active as boolean,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        institution_name: inst?.name as string | undefined,
        program_name: prog?.name as string | undefined,
        body_name: body?.name as string | undefined,
        body_abbreviation: body?.abbreviation as string | undefined,
      };
    });
  }

  static async createApproval(
    supabase: SupabaseClient,
    data: ApprovalInsert
  ): Promise<InstitutionProgramApproval> {
    const { data: created, error } = await supabase
      .from('institution_program_approvals')
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(`Failed to create approval: ${error.message}`);
    return created;
  }

  static async updateApproval(
    supabase: SupabaseClient,
    id: string,
    data: ApprovalUpdate
  ): Promise<InstitutionProgramApproval> {
    const { data: updated, error } = await supabase
      .from('institution_program_approvals')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update approval: ${error.message}`);
    return updated;
  }

  static async deleteApproval(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('institution_program_approvals')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Failed to delete approval: ${error.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Staff Specializations
  // ═══════════════════════════════════════════════════════════════════════════

  static async listStaffWithSpecializations(
    supabase: SupabaseClient,
    filters?: { institution_id?: string; specialization_id?: string; untagged_only?: boolean }
  ): Promise<StaffWithSpecializations[]> {
    // Get staff with their specializations
    let staffQuery = supabase
      .from('staff')
      .select(`
        id, first_name, last_name, institution_id,
        institution:institutions!staff_institution_id_fkey(name),
        staff_specializations(
          id, specialization_id, is_primary, verified_at, verified_by,
          specialization:hr_specializations!staff_specializations_specialization_id_fkey(name)
        )
      `)
      .order('last_name', { ascending: true });

    if (filters?.institution_id) {
      staffQuery = staffQuery.eq('institution_id', filters.institution_id);
    }

    const { data: staffData, error } = await staffQuery;
    if (error) throw new Error(`Failed to list staff specializations: ${error.message}`);

    let results: StaffWithSpecializations[] = (staffData ?? []).map((s: Record<string, unknown>) => {
      const inst = s.institution as Record<string, unknown> | null;
      const specs = (s.staff_specializations as Record<string, unknown>[]) ?? [];
      return {
        id: s.id as string,
        first_name: s.first_name as string,
        last_name: s.last_name as string,
        institution_id: s.institution_id as string,
        institution_name: inst?.name as string | undefined,
        specializations: specs.map((sp) => {
          const spec = sp.specialization as Record<string, unknown> | null;
          return {
            id: sp.id as string,
            specialization_id: sp.specialization_id as string,
            specialization_name: spec?.name as string ?? '',
            is_primary: sp.is_primary as boolean,
            verified_at: sp.verified_at as string | null,
            verified_by: sp.verified_by as string | null,
          };
        }),
      };
    });

    // Apply client-side filters
    if (filters?.specialization_id) {
      results = results.filter((s) =>
        s.specializations.some((sp) => sp.specialization_id === filters.specialization_id)
      );
    }
    if (filters?.untagged_only) {
      results = results.filter((s) => s.specializations.length === 0);
    }

    return results;
  }

  static async addSpecialization(
    supabase: SupabaseClient,
    data: StaffSpecializationInsert
  ): Promise<StaffSpecializationRow> {
    const { data: created, error } = await supabase
      .from('staff_specializations')
      .insert({
        staff_id: data.staff_id,
        specialization_id: data.specialization_id,
        is_primary: data.is_primary ?? false,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to add specialization: ${error.message}`);
    return created;
  }

  static async bulkAddSpecializations(
    supabase: SupabaseClient,
    staffIds: string[],
    specializationId: string,
    isPrimary: boolean = false
  ): Promise<StaffSpecializationRow[]> {
    const rows = staffIds.map((staffId) => ({
      staff_id: staffId,
      specialization_id: specializationId,
      is_primary: isPrimary,
    }));
    const { data: created, error } = await supabase
      .from('staff_specializations')
      .upsert(rows, { onConflict: 'staff_id,specialization_id' })
      .select();
    if (error) throw new Error(`Failed to bulk add specializations: ${error.message}`);
    return created ?? [];
  }

  static async removeSpecialization(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('staff_specializations')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Failed to remove specialization: ${error.message}`);
  }

  static async verifySpecialization(
    supabase: SupabaseClient,
    id: string,
    verifiedBy: string
  ): Promise<StaffSpecializationRow> {
    const { data: updated, error } = await supabase
      .from('staff_specializations')
      .update({ verified_at: new Date().toISOString(), verified_by: verifiedBy })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Failed to verify specialization: ${error.message}`);
    return updated;
  }

  static async setPrimarySpecialization(
    supabase: SupabaseClient,
    staffId: string,
    specializationId: string
  ): Promise<void> {
    // Unset all primaries for this staff first
    const { error: unsetError } = await supabase
      .from('staff_specializations')
      .update({ is_primary: false })
      .eq('staff_id', staffId);
    if (unsetError) throw new Error(`Failed to unset primaries: ${unsetError.message}`);

    // Set the new primary
    const { error: setError } = await supabase
      .from('staff_specializations')
      .update({ is_primary: true })
      .eq('staff_id', staffId)
      .eq('specialization_id', specializationId);
    if (setError) throw new Error(`Failed to set primary: ${setError.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Cross-Institution Allocation
  // ═══════════════════════════════════════════════════════════════════════════

  static async listAllocations(
    supabase: SupabaseClient,
    filters?: { staff_id?: string; institution_id?: string }
  ): Promise<AllocationWithStaff[]> {
    let query = supabase
      .from('hr_staff_institution_allocation')
      .select(`
        *,
        staff:staff!hr_staff_institution_allocation_staff_id_fkey(id, first_name, last_name),
        institution:institutions!hr_staff_institution_allocation_institution_id_fkey(id, name)
      `)
      .order('created_at', { ascending: false });

    if (filters?.staff_id) {
      query = query.eq('staff_id', filters.staff_id);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list allocations: ${error.message}`);

    return (data ?? []).map((row: Record<string, unknown>) => {
      const st = row.staff as Record<string, unknown> | null;
      const inst = row.institution as Record<string, unknown> | null;
      return {
        id: row.id as string,
        staff_id: row.staff_id as string,
        institution_id: row.institution_id as string,
        allocation_percentage: row.allocation_percentage as number,
        academic_year: row.academic_year as string | null,
        effective_from: row.effective_from as string,
        effective_until: row.effective_until as string | null,
        notes: row.notes as string | null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        staff_first_name: st?.first_name as string | undefined,
        staff_last_name: st?.last_name as string | undefined,
        institution_name: inst?.name as string | undefined,
      };
    });
  }

  static async createAllocation(
    supabase: SupabaseClient,
    data: AllocationInsert
  ): Promise<HRStaffInstitutionAllocation> {
    // Validate total doesn't exceed 100%
    const { data: existing, error: fetchError } = await supabase
      .from('hr_staff_institution_allocation')
      .select('allocation_percentage')
      .eq('staff_id', data.staff_id)
      .is('effective_until', null);
    if (fetchError) throw new Error(`Failed to check allocations: ${fetchError.message}`);

    const currentTotal = (existing ?? []).reduce(
      (sum: number, row: { allocation_percentage: number }) => sum + row.allocation_percentage,
      0
    );
    if (currentTotal + data.allocation_percentage > 100) {
      throw new Error(
        `Total allocation would be ${currentTotal + data.allocation_percentage}% (current: ${currentTotal}%). Maximum is 100%.`
      );
    }

    const { data: created, error } = await supabase
      .from('hr_staff_institution_allocation')
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(`Failed to create allocation: ${error.message}`);
    return created;
  }

  static async updateAllocation(
    supabase: SupabaseClient,
    id: string,
    data: AllocationUpdate
  ): Promise<HRStaffInstitutionAllocation> {
    // If percentage is being updated, validate total
    if (data.allocation_percentage !== undefined) {
      const { data: current, error: currentError } = await supabase
        .from('hr_staff_institution_allocation')
        .select('staff_id, allocation_percentage')
        .eq('id', id)
        .single();
      if (currentError) throw new Error(`Failed to fetch allocation: ${currentError.message}`);

      const { data: existing, error: fetchError } = await supabase
        .from('hr_staff_institution_allocation')
        .select('allocation_percentage')
        .eq('staff_id', current.staff_id)
        .neq('id', id)
        .is('effective_until', null);
      if (fetchError) throw new Error(`Failed to check allocations: ${fetchError.message}`);

      const otherTotal = (existing ?? []).reduce(
        (sum: number, row: { allocation_percentage: number }) => sum + row.allocation_percentage,
        0
      );
      if (otherTotal + data.allocation_percentage > 100) {
        throw new Error(
          `Total allocation would be ${otherTotal + data.allocation_percentage}% (other allocations: ${otherTotal}%). Maximum is 100%.`
        );
      }
    }

    const { data: updated, error } = await supabase
      .from('hr_staff_institution_allocation')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update allocation: ${error.message}`);
    return updated;
  }

  static async deleteAllocation(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('hr_staff_institution_allocation')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Failed to delete allocation: ${error.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Lookup helpers (institutions, programs, staff for selectors)
  // ═══════════════════════════════════════════════════════════════════════════

  static async listInstitutions(
    supabase: SupabaseClient
  ): Promise<Array<{ id: string; name: string }>> {
    const { data, error } = await supabase
      .from('institutions')
      .select('id, name')
      .order('name');
    if (error) throw new Error(`Failed to list institutions: ${error.message}`);
    return data ?? [];
  }

  static async listPrograms(
    supabase: SupabaseClient,
    institutionId?: string
  ): Promise<Array<{ id: string; name: string }>> {
    let query = supabase
      .from('programs')
      .select('id, name')
      .order('name');
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list programs: ${error.message}`);
    return data ?? [];
  }

  static async listStaff(
    supabase: SupabaseClient,
    institutionId?: string
  ): Promise<Array<{ id: string; first_name: string; last_name: string; institution_id: string }>> {
    let query = supabase
      .from('staff')
      .select('id, first_name, last_name, institution_id')
      .order('last_name');
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list staff: ${error.message}`);
    return data ?? [];
  }

  static async listSpecializations(
    supabase: SupabaseClient
  ): Promise<Array<{ id: string; name: string; body_id: string | null; is_active: boolean }>> {
    const { data, error } = await supabase
      .from('hr_specializations')
      .select('id, name, body_id, is_active')
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(`Failed to list specializations: ${error.message}`);
    return data ?? [];
  }
}
