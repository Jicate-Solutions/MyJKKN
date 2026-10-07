// lib/services/procurement/approval-chain-service.ts
//
// Category approval chains (migration 20271006105000).
//   * Categories + their steps: set by the Super Admin on /procurement/approval-flows.
//     Steps are saved only through procurement_save_category_steps (validates roles).
//   * A request copies its category's steps at submit; each step is decided only
//     through procurement_approve_request_step / procurement_decide_request_step,
//     which check "is it your turn" in the database.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ApprovalStage,
  CategoryStep,
  ChainPreviewStep,
  MyApproval,
  ProcurementCategory,
  RequestApproval,
  SaveProcurementCategoryDto,
} from '@/types/procurement';

export class ProcurementApprovalChainService {
  private static get supabase() {
    // procurement_* tables are not yet in the Supabase-generated Database type.
    return createClientSupabaseClient() as any;
  }

  /** All categories with their steps (step order), active ones first. */
  static async getCategories(includeInactive = false): Promise<ProcurementCategory[]> {
    let q = this.supabase
      .from('procurement_categories')
      .select(
        `id, name, description, sort_order, is_active,
         steps:procurement_category_approval_steps(id, stage, step_order, label, approver_kind, role_key, same_college, user_id,
           user:profiles!user_id(id, full_name, email))`
      )
      .order('sort_order')
      .order('name');
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as ProcurementCategory[]).map((c) => ({
      ...c,
      steps: [...(c.steps ?? [])].sort((a, b) => a.step_order - b.step_order),
    }));
  }

  static async saveCategory(dto: SaveProcurementCategoryDto): Promise<ProcurementCategory> {
    const row = {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
    };
    const q = dto.id
      ? this.supabase.from('procurement_categories').update(row).eq('id', dto.id)
      : this.supabase.from('procurement_categories').insert(row);
    const { data, error } = await q.select().single();
    if (error) {
      if (error.code === '23505') throw new Error(`A category named "${row.name}" already exists.`);
      throw error;
    }
    return data as ProcurementCategory;
  }

  /** Replace one of a category's two lists (0–10 approvers, in the order given). */
  static async saveSteps(categoryId: string, steps: CategoryStep[], stage: ApprovalStage = 'request'): Promise<void> {
    const payload = steps.map((s) => ({
      label: s.label.trim(),
      approver_kind: s.approver_kind,
      role_key: s.approver_kind === 'role' ? s.role_key : null,
      same_college: s.same_college,
      user_id: s.approver_kind === 'user' ? s.user_id : null,
    }));
    const { error } = await this.supabase.rpc('procurement_save_category_steps', {
      p_category_id: categoryId,
      p_steps: payload,
      p_stage: stage,
    });
    if (error) throw error;
  }

  /** Who each step resolves to for this college/department — shown before submitting. */
  static async previewChain(
    categoryId: string,
    institutionId: string,
    departmentId: string | null
  ): Promise<ChainPreviewStep[]> {
    const { data, error } = await this.supabase.rpc('procurement_preview_chain', {
      p_category_id: categoryId,
      p_institution_id: institutionId,
      p_department_id: departmentId,
    });
    if (error) throw error;
    return (data ?? []) as ChainPreviewStep[];
  }

  /** Every round of a request's steps (empty for a request without a category). */
  static async getRequestApprovals(requestId: string): Promise<RequestApproval[]> {
    const { data, error } = await this.supabase
      .from('procurement_request_approvals')
      .select('*, acted_by_profile:profiles!acted_by(full_name)')
      .eq('request_id', requestId)
      .order('round')
      .order('step_order');
    if (error) throw error;
    return (data ?? []) as RequestApproval[];
  }

  /**
   * Approve the step waiting now. Returns 'next' (another step follows) or
   * 'approved' (that was the last one). Optional quantity corrections.
   */
  static async approveStep(
    requestId: string,
    remarks?: string,
    itemChanges: { item_id: string; quantity: number }[] = []
  ): Promise<'next' | 'approved'> {
    const { data, error } = await this.supabase.rpc('procurement_approve_request_step', {
      p_request_id: requestId,
      p_remarks: remarks?.trim() || null,
      p_item_changes: itemChanges,
    });
    if (error) throw error;
    return data as 'next' | 'approved';
  }

  /** Send back ('return') or reject at the step waiting now. A reason is required. */
  static async decideStep(requestId: string, decision: 'return' | 'reject', reason: string): Promise<void> {
    const { error } = await this.supabase.rpc('procurement_decide_request_step', {
      p_request_id: requestId,
      p_decision: decision,
      p_reason: reason,
    });
    if (error) throw error;
  }

  /** id → name for the people a step is waiting for. */
  static async getNames(ids: string[]): Promise<Record<string, string>> {
    if (!ids.length) return {};
    const { data, error } = await this.supabase.from('profiles').select('id, full_name').in('id', ids);
    if (error) throw error;
    return Object.fromEntries(((data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? '']));
  }

  static async getMyApprovals(): Promise<MyApproval[]> {
    const { data, error } = await this.supabase.rpc('procurement_my_approvals');
    if (error) throw error;
    return (data ?? []) as MyApproval[];
  }

  /** True when the signed-in person is (or was) an approver on any request. */
  static async hasApprovalWork(): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('procurement_has_approval_work');
    if (error) throw error;
    return data === true;
  }
}
