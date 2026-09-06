/**
 * ProjectInstitutionService
 *
 * CRUD for the project_institutions junction table:
 *   project_institutions (id, project_id, institution_id, role, created_at, created_by)
 *
 * Business rules enforced here:
 *   - Exactly one row per project must carry role='lead'.
 *   - Attempting to add a second 'lead' throws a clear error.
 *   - Removing the lead is blocked — demote it to 'participating' first.
 *
 * Pattern: static class, SupabaseClient as first arg (matches ProjectService /
 * RiskService). Errors are thrown, not swallowed.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F11.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectInstitution } from '@/types/projects';

export type InstitutionRole = 'lead' | 'participating';

export interface ProjectInstitutionInsert {
  project_id: string;
  institution_id: string;
  role?: InstitutionRole;
}

export interface ProjectInstitutionUpdate {
  role: InstitutionRole;
}

export class ProjectInstitutionService {
  // ─── List ────────────────────────────────────────────────────────────────────

  static async listByProject(
    supabase: SupabaseClient,
    projectId: string
  ): Promise<ProjectInstitution[]> {
    const { data, error } = await supabase
      .from('project_institutions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as ProjectInstitution[];
  }

  // ─── Add ─────────────────────────────────────────────────────────────────────

  /**
   * Add an institution to a project.
   * If role='lead' and there is already a lead, throws.
   */
  static async addInstitution(
    supabase: SupabaseClient,
    input: ProjectInstitutionInsert
  ): Promise<ProjectInstitution> {
    const role: InstitutionRole = input.role ?? 'participating';

    if (role === 'lead') {
      // Guard: ensure no existing lead for this project.
      const { data: existing, error: checkError } = await supabase
        .from('project_institutions')
        .select('id')
        .eq('project_id', input.project_id)
        .eq('role', 'lead')
        .maybeSingle();

      if (checkError) throw checkError;
      if (existing) {
        throw new Error(
          'A lead institution already exists for this project. Change the existing lead role before assigning a new one.'
        );
      }
    }

    const { data, error } = await supabase
      .from('project_institutions')
      .insert({
        project_id: input.project_id,
        institution_id: input.institution_id,
        role,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectInstitution;
  }

  // ─── Update role ─────────────────────────────────────────────────────────────

  /**
   * Update the role of an institution membership.
   * If promoting to 'lead', ensures no other lead exists first.
   */
  static async updateRole(
    supabase: SupabaseClient,
    id: string,
    update: ProjectInstitutionUpdate,
    projectId: string
  ): Promise<ProjectInstitution> {
    if (update.role === 'lead') {
      // Guard: check for existing lead that is NOT this row.
      const { data: existing, error: checkError } = await supabase
        .from('project_institutions')
        .select('id')
        .eq('project_id', projectId)
        .eq('role', 'lead')
        .neq('id', id)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existing) {
        throw new Error(
          'A lead institution already exists. Demote it to "participating" before promoting another.'
        );
      }
    }

    const { data, error } = await supabase
      .from('project_institutions')
      .update({ role: update.role })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectInstitution;
  }

  // ─── Remove ──────────────────────────────────────────────────────────────────

  /**
   * Remove an institution from a project.
   * Blocks removal of the lead row — caller must demote first.
   */
  static async removeInstitution(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    // Fetch the row to check its role before deleting.
    const { data: row, error: fetchError } = await supabase
      .from('project_institutions')
      .select('role')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (row?.role === 'lead') {
      throw new Error(
        'Cannot remove the lead institution. Change its role to "participating" first.'
      );
    }

    const { error } = await supabase
      .from('project_institutions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
