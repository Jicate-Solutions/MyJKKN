// lib/services/grievance/grievance-category-service.ts
// ============================================================================
// Admin CRUD for grievance_categories. Separate from grievance-service.ts
// (ticket ops) because permission scope differs: categories are managed by
// 'grievance.categories.manage' (principal/admin), tickets by
// 'grievance.tickets.*' (staff + filers).
//
// is_system rows are RLS-writable by admins but the UI (CrudRowActions)
// refuses delete on them. This keeps the 5 seeded defaults survivable on
// prod while still allowing edits (e.g. rename local label).
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface GrievanceCategoryRow {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  default_sla_hours: number | null;
  default_assignee_role: string | null;
  default_naac_metric_code: string | null;
  attachment_required: boolean;
  is_emergency: boolean;
  is_active: boolean | null;
  is_system: boolean;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface GrievanceCategoryInput {
  institution_id: string;
  name: string;
  description?: string | null;
  parent_id?: string | null;
  default_sla_hours?: number | null;
  default_assignee_role?: string | null;
  default_naac_metric_code?: string | null;
  attachment_required?: boolean;
  is_emergency?: boolean;
  sort_order?: number | null;
}

export class GrievanceCategoryService {
  private static supabase = createClientSupabaseClient();

  static async list(institutionId: string): Promise<GrievanceCategoryRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('grievance_categories')
      .select('*')
      .eq('institution_id', institutionId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as GrievanceCategoryRow[];
  }

  static async create(input: GrievanceCategoryInput): Promise<GrievanceCategoryRow> {
    const { data, error } = await (this.supabase as any)
      .from('grievance_categories')
      .insert({
        institution_id: input.institution_id,
        name: input.name,
        description: input.description ?? null,
        parent_id: input.parent_id ?? null,
        default_sla_hours: input.default_sla_hours ?? 72,
        default_assignee_role: input.default_assignee_role ?? 'admin',
        default_naac_metric_code: input.default_naac_metric_code ?? '7.7.1',
        attachment_required: input.attachment_required ?? false,
        is_emergency: input.is_emergency ?? false,
        sort_order: input.sort_order ?? 100,
        is_active: true,
        is_system: false, // user-created categories never mark themselves system
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as GrievanceCategoryRow;
  }

  static async update(id: string, patch: Partial<GrievanceCategoryInput> & { is_active?: boolean }): Promise<GrievanceCategoryRow> {
    const { data, error } = await (this.supabase as any)
      .from('grievance_categories')
      .update({
        ...patch,
        // Never let is_system be toggled from UI (silent drop).
        is_system: undefined,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as GrievanceCategoryRow;
  }

  static async delete(id: string): Promise<void> {
    // RLS + CrudRowActions both refuse delete on is_system=true; this is the
    // third safety net (service layer) so a rogue caller using the service
    // directly still hits the block.
    const { data: existing, error: fetchErr } = await (this.supabase as any)
      .from('grievance_categories')
      .select('id, is_system')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;
    if (existing?.is_system) {
      throw new Error('System-default categories cannot be deleted. Edit the name/SLA instead, or deactivate.');
    }

    const { error } = await (this.supabase as any)
      .from('grievance_categories')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  static async bulkDelete(ids: string[]): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.delete(id);
        success.push(id);
      } catch (err) {
        failed.push({ id, error: (err as Error).message });
      }
    }
    return { success, failed };
  }
}
