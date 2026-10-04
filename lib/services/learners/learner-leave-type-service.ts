// Learner Leave Types + per-type role-based approval flows.
//
// One group-wide list (learner_leave_types) replaces the hostel leave types and
// the per-institution OD sub-categories. Each type has a group default flow
// (institution_id NULL) and optional institution overrides; each step is a
// custom role + a scope, resolved to people only when the step is reached
// (fn_lo_can_act). RLS: config is readable by every signed-in user, writable
// with learners.leave_types.manage.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import type { LeaveOndutyCategory } from '@/types/leave-onduty';
import type {
  LearnerLeaveFlow,
  LearnerLeaveFlowStep,
  LearnerLeaveResidency,
  LearnerLeaveType,
  LearnerLeaveTypeFilters,
  LearnerLeaveTypeInput,
  LearnerLeaveStepScope,
} from '@/types/learner-leave-types';

// learner_leave_* are not in the generated Database type until it is regenerated.
const getSupabase = () => createClientSupabaseClient() as any;

const APPROVE_KEY = 'academic.leave_onduty.approve';

export interface ApprovalRoleOption {
  id: string;
  role_key: string;
  role_name: string;
  institution_scope: string | null;
  can_open_approvals: boolean;
}

export class LearnerLeaveTypeService {
  static async listTypes(filters: LearnerLeaveTypeFilters = {}): Promise<LearnerLeaveType[]> {
    let query = getSupabase()
      .from('learner_leave_types')
      .select('*')
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category);
    if (filters.residency && filters.residency !== 'all') query = query.eq('residency', filters.residency);
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
    if (filters.search?.trim()) {
      const s = filters.search.trim().replace(/[%,()]/g, ' ');
      query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load leave types: ${getErrorMessage(error)}`);
    return (data ?? []) as LearnerLeaveType[];
  }

  /**
   * Hostel = accommodation type "Hostel" OR an active hostel allocation;
   * everyone else is a day scholar. Mirrors fn_lo_seed_approvals, which is the
   * authoritative check — this only filters the dropdown.
   */
  static async getLearnerResidency(learnerId: string): Promise<Exclude<LearnerLeaveResidency, 'both'>> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('learners_profiles')
      .select('profile_id, accommodation_type:accommodation_types(name)')
      .eq('id', learnerId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load your residency: ${getErrorMessage(error)}`);

    if (String(data?.accommodation_type?.name ?? '').toLowerCase() === 'hostel') return 'hostel';

    if (data?.profile_id) {
      const { data: alloc, error: allocError } = await supabase
        .from('hostel_allocations')
        .select('id')
        .eq('learner_id', data.profile_id)
        .eq('status', 'active')
        .limit(1);
      if (!allocError && (alloc?.length ?? 0) > 0) return 'hostel';
    }
    return 'day_scholar';
  }

  static async getEligibleTypes(
    residency: Exclude<LearnerLeaveResidency, 'both'>,
    category: LeaveOndutyCategory
  ): Promise<LearnerLeaveType[]> {
    const { data, error } = await getSupabase()
      .from('learner_leave_types')
      .select('*')
      .eq('is_active', true)
      .eq('category', category)
      .in('residency', [residency, 'both'])
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw new Error(`Failed to load leave types: ${getErrorMessage(error)}`);
    return (data ?? []) as LearnerLeaveType[];
  }

  static async createType(input: LearnerLeaveTypeInput, userId: string): Promise<LearnerLeaveType> {
    const { data, error } = await getSupabase()
      .from('learner_leave_types')
      .insert({ ...input, created_by: userId, updated_by: userId })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') throw new Error(`The code "${input.code}" is already used by another leave type`);
      throw new Error(`Failed to create leave type: ${getErrorMessage(error)}`);
    }
    return data as LearnerLeaveType;
  }

  static async updateType(
    id: string,
    input: Partial<LearnerLeaveTypeInput>,
    userId: string
  ): Promise<LearnerLeaveType> {
    const { data, error } = await getSupabase()
      .from('learner_leave_types')
      .update({ ...input, updated_by: userId })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      if (error.code === '23505') throw new Error(`The code "${input.code}" is already used by another leave type`);
      throw new Error(`Failed to update leave type: ${getErrorMessage(error)}`);
    }
    return data as LearnerLeaveType;
  }

  static async deleteType(id: string): Promise<void> {
    const { error } = await getSupabase().from('learner_leave_types').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') {
        throw new Error('This leave type is already used by applications or gate passes. Deactivate it instead.');
      }
      throw new Error(`Failed to delete leave type: ${getErrorMessage(error)}`);
    }
  }

  /** Every flow (default + overrides) for one type, steps in order. */
  static async listFlows(leaveTypeId: string): Promise<LearnerLeaveFlow[]> {
    const { data, error } = await getSupabase()
      .from('learner_leave_flows')
      .select(
        `id, leave_type_id, institution_id, flow_residency, is_active,
         institution:institutions(id, name),
         steps:learner_leave_flow_steps(id, step_order, role_id, scope,
           role:custom_roles(id, role_key, role_name, institution_scope))`
      )
      .eq('leave_type_id', leaveTypeId);
    if (error) throw new Error(`Failed to load approval flows: ${getErrorMessage(error)}`);

    return ((data ?? []) as LearnerLeaveFlow[])
      .map((f) => ({ ...f, steps: [...(f.steps ?? [])].sort((a, b) => a.step_order - b.step_order) }))
      .sort((a, b) => {
        if (a.institution_id === null) return -1;
        if (b.institution_id === null) return 1;
        return (a.institution?.name ?? '').localeCompare(b.institution?.name ?? '');
      });
  }

  /** Replace a flow's steps atomically. Empty steps removes the flow. */
  static async saveFlow(
    leaveTypeId: string,
    institutionId: string | null,
    steps: Pick<LearnerLeaveFlowStep, 'role_id' | 'scope'>[],
    flowResidency: 'day_scholar' | 'hostel' | null = null
  ): Promise<void> {
    const { error } = await getSupabase().rpc('fn_lo_save_flow', {
      p_leave_type_id: leaveTypeId,
      p_institution_id: institutionId,
      p_residency: flowResidency,
      p_steps: steps.map((s) => ({ role_id: s.role_id, scope: s.scope as LearnerLeaveStepScope })),
    });
    if (error) throw new Error(`Failed to save approval flow: ${getErrorMessage(error)}`);
  }

  static async listApprovalRoles(): Promise<ApprovalRoleOption[]> {
    const { data, error } = await getSupabase()
      .from('custom_roles')
      .select('id, role_key, role_name, institution_scope, permissions')
      .eq('is_active', true)
      .order('role_name', { ascending: true });
    if (error) throw new Error(`Failed to load roles: ${getErrorMessage(error)}`);

    return ((data ?? []) as any[])
      .filter((r) => r.role_key !== 'student')
      .map((r) => ({
        id: r.id,
        role_key: r.role_key,
        role_name: r.role_name,
        institution_scope: r.institution_scope,
        // Value-checked, not key presence: a key stored as false grants nothing.
        can_open_approvals: r.permissions?.[APPROVE_KEY] === true,
      }));
  }
}
