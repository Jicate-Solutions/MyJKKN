/**
 * Project Service
 *
 * CRUD + listing for the `projects` table and its CRUDable masters
 * (project_types, project_statuses, project_priorities).
 *
 * Pattern: static class, SupabaseClient as first arg (matches
 * RecruitmentNeedSignalService / LeaveService). Errors are thrown, not swallowed.
 * Spec: specs/pm-projects-module-2026-05-26.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Project,
  ProjectWithRelations,
  ProjectInsert,
  ProjectUpdate,
  ProjectFilters,
  ProjectType,
  ProjectStatus,
  ProjectPriority,
} from '@/types/projects';

const PROJECT_RELATIONS_SELECT = `
  *,
  project_type:project_types(id, key, name, icon, color),
  status:project_statuses(id, key, name, category, color),
  priority:project_priorities(id, key, name, color, weight)
`;

export class ProjectService {
  // ─── Projects ─────────────────────────────────────────────────────────────

  static async listProjects(
    supabase: SupabaseClient,
    filters: ProjectFilters = {}
  ): Promise<ProjectWithRelations[]> {
    let query = supabase
      .from('projects')
      .select(PROJECT_RELATIONS_SELECT)
      .order('updated_at', { ascending: false });

    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.statusId) {
      query = query.eq('status_id', filters.statusId);
    }
    if (filters.projectTypeId) {
      query = query.eq('project_type_id', filters.projectTypeId);
    }
    if (filters.priorityId) {
      query = query.eq('priority_id', filters.priorityId);
    }
    if (filters.ownerStaffId) {
      query = query.eq('owner_staff_id', filters.ownerStaffId);
    }
    if (filters.ragStatus) {
      query = query.eq('rag_status', filters.ragStatus);
    }
    if (filters.scopeModel) {
      query = query.eq('scope_model', filters.scopeModel);
    }
    if (filters.financialYear) {
      query = query.eq('financial_year', filters.financialYear);
    }
    if (filters.clientId) {
      query = query.eq('client_id', filters.clientId);
    }
    if (filters.solutionId) {
      query = query.eq('solution_id', filters.solutionId);
    }
    if (filters.isOkr !== undefined && filters.isOkr !== null) {
      query = query.eq('is_okr', filters.isOkr);
    }
    // Soft-delete: hide cancelled rows unless explicitly requested.
    if (!filters.includeCancelled) {
      query = query.is('cancelled_at', null);
    }
    if (filters.search) {
      query = query.or(
        `title.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    let rows = (data ?? []) as ProjectWithRelations[];
    // statusCategory is a relation field — filter in memory (PostgREST can't
    // .eq on an embedded column without !inner; keeps the master join nullable).
    if (filters.statusCategory) {
      rows = rows.filter((r) => r.status?.category === filters.statusCategory);
    }
    return rows;
  }

  static async getProject(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectWithRelations | null> {
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_RELATIONS_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectWithRelations | null;
  }

  static async createProject(
    supabase: SupabaseClient,
    input: ProjectInsert
  ): Promise<Project> {
    const { data, error } = await supabase
      .from('projects')
      .insert(input)
      .select('*')
      .single();

    if (error) throw error;
    return data as Project;
  }

  static async updateProject(
    supabase: SupabaseClient,
    id: string,
    input: ProjectUpdate
  ): Promise<Project> {
    const { data, error } = await supabase
      .from('projects')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as Project;
  }

  /**
   * Soft-delete: mark cancelled with a reason. Does NOT delete the row —
   * projects.cancelled_at / cancellation_reason carry the tombstone.
   */
  static async cancelProject(
    supabase: SupabaseClient,
    id: string,
    reason: string,
    cancelledBy?: string | null
  ): Promise<Project> {
    const { data, error } = await supabase
      .from('projects')
      .update({
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        ...(cancelledBy ? { cancelled_by: cancelledBy } : {}),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as Project;
  }

  // ─── Masters (read; CRUDable elsewhere via admin) ───────────────────────────

  static async listProjectTypes(
    supabase: SupabaseClient,
    includeInactive = false
  ): Promise<ProjectType[]> {
    let query = supabase
      .from('project_types')
      .select('*')
      .order('order_index', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectType[];
  }

  static async listProjectStatuses(
    supabase: SupabaseClient,
    includeInactive = false
  ): Promise<ProjectStatus[]> {
    let query = supabase
      .from('project_statuses')
      .select('*')
      .order('order_index', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectStatus[];
  }

  static async listProjectPriorities(
    supabase: SupabaseClient,
    includeInactive = false
  ): Promise<ProjectPriority[]> {
    let query = supabase
      .from('project_priorities')
      .select('*')
      .order('order_index', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectPriority[];
  }
}
