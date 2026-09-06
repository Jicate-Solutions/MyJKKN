/**
 * Template Service
 *
 * CRUD for project_templates:
 *   - list active templates (with project_type join for display)
 *   - get a single template
 *   - save-as-template: snapshot a project's tasks into blueprint jsonb
 *   - create-from-template: insert a new project + its blueprint tasks
 *
 * Pattern: static class, SupabaseClient as first arg (matches RiskService,
 * ProjectService). Errors are thrown, not swallowed.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F10.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ProjectService } from '@/lib/services/projects/project-service';
import { TaskService } from '@/lib/services/projects/task-service';
import type { ProjectTemplate, ProjectType, ProjectInsert } from '@/types/projects';

// ─── Blueprint shape ────────────────────────────────────────────────────────────
// Stored in project_templates.blueprint (jsonb).
// Intentionally minimal: title, description, task_type, status_key — no ids,
// no owner, no dates. When creating from template these are stripped too.

export interface BlueprintTask {
  title: string;
  description: string | null;
  task_type: string;
  status_key: string;
  order_index: number;
  estimated_hours: number | null;
  story_points: number | null;
}

export interface TemplateBlueprint {
  version: 1;
  tasks: BlueprintTask[];
  /** Snapshot count for display; does not drive create logic. */
  task_count: number;
}

// ─── Extended read shape (type relation resolved) ──────────────────────────────

export interface ProjectTemplateWithType extends ProjectTemplate {
  project_type?: Pick<ProjectType, 'id' | 'key' | 'name' | 'icon' | 'color'> | null;
}

// ─── Insert / Update shapes ────────────────────────────────────────────────────

export interface ProjectTemplateInsert {
  name: string;
  description?: string | null;
  project_type_id?: string | null;
  blueprint: Record<string, unknown>;
  source_project_id?: string | null;
  is_active?: boolean;
}

export interface ProjectTemplateUpdate {
  name?: string;
  description?: string | null;
  project_type_id?: string | null;
  blueprint?: Record<string, unknown>;
  is_active?: boolean;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface TemplateFilters {
  projectTypeId?: string | null;
  search?: string | null;
  /** Default: only active templates */
  includeInactive?: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class TemplateService {
  private static readonly SELECT_WITH_TYPE = `
    *,
    project_type:project_types(id, key, name, icon, color)
  `;

  // ─── Read ──────────────────────────────────────────────────────────────────

  static async listTemplates(
    supabase: SupabaseClient,
    filters: TemplateFilters = {}
  ): Promise<ProjectTemplateWithType[]> {
    let query = supabase
      .from('project_templates')
      .select(TemplateService.SELECT_WITH_TYPE)
      .order('created_at', { ascending: false });

    if (!filters.includeInactive) {
      query = query.eq('is_active', true);
    }
    if (filters.projectTypeId) {
      query = query.eq('project_type_id', filters.projectTypeId);
    }
    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectTemplateWithType[];
  }

  static async getTemplate(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectTemplateWithType | null> {
    const { data, error } = await supabase
      .from('project_templates')
      .select(TemplateService.SELECT_WITH_TYPE)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectTemplateWithType | null;
  }

  // ─── Create / Update / Delete ───────────────────────────────────────────────

  static async createTemplate(
    supabase: SupabaseClient,
    input: ProjectTemplateInsert
  ): Promise<ProjectTemplate> {
    const { data, error } = await supabase
      .from('project_templates')
      .insert(input)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectTemplate;
  }

  static async updateTemplate(
    supabase: SupabaseClient,
    id: string,
    input: ProjectTemplateUpdate
  ): Promise<ProjectTemplate> {
    const { data, error } = await supabase
      .from('project_templates')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectTemplate;
  }

  static async deleteTemplate(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('project_templates')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ─── Save-as-template ───────────────────────────────────────────────────────
  /**
   * Snapshot a project's tasks into a new template's blueprint jsonb.
   * Only task shape (title, description, task_type, status_key, order_index,
   * estimated_hours, story_points) is captured — no ids, owners, or dates.
   *
   * Returns the created template.
   */
  static async saveProjectAsTemplate(
    supabase: SupabaseClient,
    input: {
      projectId: string;
      name: string;
      description?: string | null;
      projectTypeId?: string | null;
    }
  ): Promise<ProjectTemplate> {
    // 1. Fetch all tasks for the project (ordered by order_index).
    const tasks = await TaskService.listTasks(supabase, {
      projectId: input.projectId,
    });

    // 2. Build blueprint.
    const blueprintTasks: BlueprintTask[] = tasks.map((t) => ({
      title: t.title,
      description: t.description ?? null,
      task_type: t.task_type,
      status_key: t.status_key,
      order_index: t.order_index,
      estimated_hours: t.estimated_hours ?? null,
      story_points: t.story_points ?? null,
    }));

    const blueprint: TemplateBlueprint = {
      version: 1,
      tasks: blueprintTasks,
      task_count: blueprintTasks.length,
    };

    // 3. Resolve project_type_id if not supplied.
    let resolvedTypeId = input.projectTypeId ?? null;
    if (!resolvedTypeId) {
      const project = await ProjectService.getProject(supabase, input.projectId);
      resolvedTypeId = project?.project_type_id ?? null;
    }

    // 4. Insert template.
    return TemplateService.createTemplate(supabase, {
      name: input.name,
      description: input.description ?? null,
      project_type_id: resolvedTypeId,
      blueprint: blueprint as unknown as Record<string, unknown>,
      source_project_id: input.projectId,
    });
  }

  // ─── Create-from-template ──────────────────────────────────────────────────
  /**
   * Create a new project from a template's blueprint:
   *   1. Insert the project row via ProjectService.
   *   2. Create each blueprint task via TaskService (status reset to 'todo').
   *   3. source_template_id stamped on the project at insert time.
   *
   * Returns the newly created project id and how many tasks were seeded.
   */
  static async createProjectFromTemplate(
    supabase: SupabaseClient,
    input: {
      templateId: string;
      projectInput: Omit<ProjectInsert, 'source_template_id'>;
    }
  ): Promise<{ projectId: string; tasksCreated: number }> {
    // 1. Load template.
    const template = await TemplateService.getTemplate(supabase, input.templateId);
    if (!template) {
      throw new Error(`Template ${input.templateId} not found`);
    }

    // 2. Create project (include source_template_id).
    const project = await ProjectService.createProject(supabase, {
      ...input.projectInput,
      source_template_id: input.templateId,
      project_type_id:
        input.projectInput.project_type_id ?? template.project_type_id ?? null,
    });

    // 3. Create tasks from blueprint (sequential — safe for low task counts).
    const bp = template.blueprint as unknown as TemplateBlueprint;
    const bpTasks: BlueprintTask[] = bp?.tasks ?? [];

    let tasksCreated = 0;
    for (const bt of bpTasks) {
      await TaskService.createTask(supabase, {
        project_id: project.id,
        title: bt.title,
        description: bt.description ?? null,
        task_type: bt.task_type,
        status_key: 'todo', // always reset to todo on create-from-template
        order_index: bt.order_index,
        estimated_hours: bt.estimated_hours ?? null,
        story_points: bt.story_points ?? null,
      });
      tasksCreated += 1;
    }

    return { projectId: project.id, tasksCreated };
  }
}
