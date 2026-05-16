/**
 * HR Onboarding Service (T3.1).
 *
 * Static class — SupabaseClient passed as first argument (mirrors
 * ShiftService). Methods cover the per-cadre TEMPLATE table (admin CRUD).
 *
 *   listChecklists  — list templates filtered by org / cadre / active
 *   getChecklist    — single record by id (for detail/drill-down)
 *   createChecklist — admin only
 *   updateChecklist — admin only
 *   deleteChecklist — hard delete (soft-archival via is_active=false)
 *   updateStep      — convenience: re-write a single step at index N
 *
 * NOTE: There is NO companion instance table in production. The original
 * task scope mentioned a `/api/hr/recruitment/candidates/[id]/onboarding/start`
 * route that "creates the initial checklist row when a candidate is hired",
 * but no such route or instance table exists in the repo or schema. Phase 2
 * needs a `hr_staff_onboarding_progress` table to track per-joinee progress.
 *
 * Spec: specs/hr-module-decomposition-2026-05-09.md (T3.1)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HROnboardingChecklist,
  HROnboardingChecklistInsert,
  HROnboardingChecklistUpdate,
  HROnboardingChecklistView,
  HROnboardingStep,
  OnboardingChecklistFilters,
} from '@/types/hr-onboarding';

export class OnboardingService {
  /**
   * List checklist templates with denormalized org + cadre names.
   *
   * Active-by-default — pass activeOnly=false from admin to see archived
   * templates too. Sorted by org name, then cadre name (catch-all rows where
   * cadre is null sort first within their org).
   */
  static async listChecklists(
    supabase: SupabaseClient,
    filters: OnboardingChecklistFilters = {},
  ): Promise<HROnboardingChecklistView[]> {
    const activeOnly = filters.activeOnly ?? true;

    let q = supabase
      .from('hr_onboarding_checklists')
      .select(
        `
        id,
        hr_organization_id,
        applies_to_cadre_id,
        checklist_name,
        steps,
        is_active,
        valid_from,
        valid_until,
        superseded_by,
        created_by,
        updated_by,
        created_at,
        updated_at,
        hr_organizations(name),
        hr_cadres(name, code)
      `,
      )
      .order('checklist_name');

    if (activeOnly) q = q.eq('is_active', true);
    if (filters.hrOrganizationId) {
      q = q.eq('hr_organization_id', filters.hrOrganizationId);
    }
    if (filters.cadreId) {
      q = q.eq('applies_to_cadre_id', filters.cadreId);
    }

    const { data, error } = await q;
    if (error) throw error;

    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const orgRel = r.hr_organizations as { name?: string } | null;
      const cadreRel = r.hr_cadres as { name?: string; code?: string } | null;
      return {
        id: r.id as string,
        hr_organization_id: r.hr_organization_id as string,
        applies_to_cadre_id: (r.applies_to_cadre_id as string | null) ?? null,
        checklist_name: r.checklist_name as string,
        steps: Array.isArray(r.steps) ? (r.steps as HROnboardingStep[]) : [],
        is_active: Boolean(r.is_active),
        valid_from: r.valid_from as string,
        valid_until: (r.valid_until as string | null) ?? null,
        superseded_by: (r.superseded_by as string | null) ?? null,
        created_by: (r.created_by as string | null) ?? null,
        updated_by: (r.updated_by as string | null) ?? null,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
        organization_name: orgRel?.name ?? null,
        cadre_name: cadreRel?.name ?? null,
        cadre_code: cadreRel?.code ?? null,
      } satisfies HROnboardingChecklistView;
    });
  }

  static async getChecklist(
    supabase: SupabaseClient,
    id: string,
  ): Promise<HROnboardingChecklist | null> {
    const { data, error } = await supabase
      .from('hr_onboarding_checklists')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const r = data as Record<string, unknown>;
    return {
      ...(r as unknown as HROnboardingChecklist),
      steps: Array.isArray(r.steps) ? (r.steps as HROnboardingStep[]) : [],
    };
  }

  static async createChecklist(
    supabase: SupabaseClient,
    payload: HROnboardingChecklistInsert,
  ): Promise<HROnboardingChecklist> {
    const name = (payload.checklist_name ?? '').trim();
    if (!name) throw new Error('Checklist name is required.');
    if (!payload.hr_organization_id) {
      throw new Error('HR organization is required.');
    }
    if (!Array.isArray(payload.steps) || payload.steps.length === 0) {
      throw new Error('At least one step is required.');
    }

    const insertPayload: Record<string, unknown> = {
      hr_organization_id: payload.hr_organization_id,
      applies_to_cadre_id: payload.applies_to_cadre_id ?? null,
      checklist_name: name,
      steps: payload.steps,
      is_active: payload.is_active ?? true,
    };

    const { data, error } = await supabase
      .from('hr_onboarding_checklists')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as HROnboardingChecklist;
  }

  static async updateChecklist(
    supabase: SupabaseClient,
    id: string,
    patch: HROnboardingChecklistUpdate,
  ): Promise<HROnboardingChecklist> {
    if (
      patch.checklist_name !== undefined &&
      patch.checklist_name.trim().length === 0
    ) {
      throw new Error('Checklist name cannot be empty.');
    }
    if (patch.steps !== undefined) {
      if (!Array.isArray(patch.steps) || patch.steps.length === 0) {
        throw new Error('Steps cannot be empty.');
      }
    }

    const updatePayload: Record<string, unknown> = {
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('hr_onboarding_checklists')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HROnboardingChecklist;
  }

  static async deleteChecklist(
    supabase: SupabaseClient,
    id: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('hr_onboarding_checklists')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Convenience: replace one step at the given 1-based order. Used by the
   * admin UI when the user is editing a single step inline (without
   * re-typing the whole steps[] block). Currently unused — exposed for
   * future inline-edit UI in /admin/hr/onboarding-checklists.
   */
  static async updateStep(
    supabase: SupabaseClient,
    id: string,
    stepOrder: number,
    nextStep: HROnboardingStep,
  ): Promise<HROnboardingChecklist> {
    const current = await this.getChecklist(supabase, id);
    if (!current) {
      throw new Error('Checklist not found.');
    }
    const next: HROnboardingStep[] = current.steps.map((s) =>
      s.order === stepOrder ? { ...nextStep, order: stepOrder } : s,
    );
    return this.updateChecklist(supabase, id, { steps: next });
  }
}
