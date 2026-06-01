/**
 * Budget Service
 *
 * CRUD for project_budget (line items), project_budget_categories (master),
 * and project_budget_changes (change log).
 *
 * Pattern: static class, SupabaseClient as first arg (mirrors RiskService /
 * ProjectService). Errors are thrown, not swallowed.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F6.
 *
 * Actor FKs (requested_by / approved_by) are passed as null from the UI layer
 * because there is no current-staff helper on the client path. A future
 * auth-context helper can fill them in; wired when available.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProjectBudget,
  ProjectBudgetCategory,
  ProjectBudgetChange,
} from '@/types/projects';
import { getCurrentActorId } from '@/lib/services/projects/_actor';

// ─── Input shapes ────────────────────────────────────────────────────────────────

export interface BudgetLineInsert {
  project_id: string;
  category_id?: string | null;
  planned_amount_inr: number;
  actual_amount_inr?: number;
  forecast_amount_inr?: number | null;
  currency?: string;
  period_month?: string | null;
  notes?: string | null;
}

export interface BudgetLineUpdate {
  category_id?: string | null;
  planned_amount_inr?: number;
  actual_amount_inr?: number;
  forecast_amount_inr?: number | null;
  currency?: string;
  period_month?: string | null;
  notes?: string | null;
}

export interface BudgetChangeInsert {
  project_id: string;
  budget_id: string | null;
  old_amount_inr: number | null;
  new_amount_inr: number | null;
  reason: string | null;
  /** Defaults to 'pending' in DB; pass explicitly to override. */
  approval_status?: string;
  /** Actor FK — null until current-staff helper is wired. */
  requested_by?: string | null;
}

export interface BudgetFilters {
  projectId?: string | null;
  categoryId?: string | null;
  periodMonth?: string | null;
}

// ─── Budget Categories ───────────────────────────────────────────────────────────

export class BudgetCategoryService {
  static async listCategories(supabase: SupabaseClient): Promise<ProjectBudgetCategory[]> {
    const { data, error } = await supabase
      .from('project_budget_categories')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return (data ?? []) as ProjectBudgetCategory[];
  }
}

// ─── Budget Lines ────────────────────────────────────────────────────────────────

export class BudgetService {
  static async listBudgetLines(
    supabase: SupabaseClient,
    filters: BudgetFilters = {}
  ): Promise<ProjectBudget[]> {
    let query = supabase
      .from('project_budget')
      .select('*')
      .order('period_month', { ascending: true, nullsFirst: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }
    if (filters.periodMonth) {
      query = query.eq('period_month', filters.periodMonth);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectBudget[];
  }

  static async getBudgetLine(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectBudget | null> {
    const { data, error } = await supabase
      .from('project_budget')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectBudget | null;
  }

  static async createBudgetLine(
    supabase: SupabaseClient,
    input: BudgetLineInsert
  ): Promise<ProjectBudget> {
    const { data, error } = await supabase
      .from('project_budget')
      .insert({
        project_id: input.project_id,
        category_id: input.category_id ?? null,
        planned_amount_inr: input.planned_amount_inr,
        actual_amount_inr: input.actual_amount_inr ?? 0,
        forecast_amount_inr: input.forecast_amount_inr ?? null,
        currency: input.currency ?? 'INR',
        period_month: input.period_month ?? null,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectBudget;
  }

  static async updateBudgetLine(
    supabase: SupabaseClient,
    id: string,
    input: BudgetLineUpdate
  ): Promise<ProjectBudget> {
    const { data, error } = await supabase
      .from('project_budget')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectBudget;
  }

  static async deleteBudgetLine(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase.from('project_budget').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── Budget Changes ────────────────────────────────────────────────────────────

  static async listBudgetChanges(
    supabase: SupabaseClient,
    projectId: string
  ): Promise<ProjectBudgetChange[]> {
    const { data, error } = await supabase
      .from('project_budget_changes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ProjectBudgetChange[];
  }

  static async recordBudgetChange(
    supabase: SupabaseClient,
    input: BudgetChangeInsert
  ): Promise<ProjectBudgetChange> {
    // requested_by → project_budget_changes.requested_by FK → profiles(id)
    // No DB default; resolved here. Caller-supplied value takes precedence.
    const requestedBy =
      input.requested_by !== undefined
        ? input.requested_by
        : await getCurrentActorId(supabase);

    const { data, error } = await supabase
      .from('project_budget_changes')
      .insert({
        project_id: input.project_id,
        budget_id: input.budget_id ?? null,
        old_amount_inr: input.old_amount_inr ?? null,
        new_amount_inr: input.new_amount_inr ?? null,
        reason: input.reason ?? null,
        approval_status: input.approval_status ?? 'pending',
        requested_by: requestedBy,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectBudgetChange;
  }
}
