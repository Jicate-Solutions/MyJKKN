/**
 * Timeline Service
 *
 * Read helpers the Gantt timeline needs that the existing TaskService /
 * ProjectService don't cover: phases, milestones, and the task dependency
 * graph. Mirrors the static-class + SupabaseClient-first-arg pattern of
 * task-service.ts. Errors are thrown.
 *
 * The data layer (project-service / task-service) already covers tasks; this
 * service is purely additive for the timeline view (F2). It does NOT modify
 * tasks — drag-to-move uses the existing useUpdateTask hook.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md (Feature F2)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProjectPhase,
  ProjectMilestone,
  ProjectTaskDependency,
} from '@/types/projects';

export class TimelineService {
  /** Phases for a project, in Gantt order (order_index → start_date). */
  static async listPhases(
    supabase: SupabaseClient,
    projectId: string
  ): Promise<ProjectPhase[]> {
    const { data, error } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true })
      .order('start_date', { ascending: true, nullsFirst: true });

    if (error) throw error;
    return (data ?? []) as ProjectPhase[];
  }

  /** Formal milestones for a project (diamond markers). */
  static async listMilestones(
    supabase: SupabaseClient,
    projectId: string
  ): Promise<ProjectMilestone[]> {
    const { data, error } = await supabase
      .from('project_milestones')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true })
      .order('planned_date', { ascending: true, nullsFirst: true });

    if (error) throw error;
    return (data ?? []) as ProjectMilestone[];
  }

  /**
   * Dependency edges for every task in a project. The table has no project_id,
   * so we resolve the project's task ids first and filter on task_id. Returns
   * [] when the project has no tasks (avoids an `.in('task_id', [])` query).
   */
  static async listDependencies(
    supabase: SupabaseClient,
    projectId: string
  ): Promise<ProjectTaskDependency[]> {
    const { data: taskRows, error: taskErr } = await supabase
      .from('project_tasks')
      .select('id')
      .eq('project_id', projectId);

    if (taskErr) throw taskErr;
    const taskIds = (taskRows ?? []).map((r: { id: string }) => r.id);
    if (taskIds.length === 0) return [];

    const { data, error } = await supabase
      .from('project_task_dependencies')
      .select('*')
      .in('task_id', taskIds);

    if (error) throw error;
    return (data ?? []) as ProjectTaskDependency[];
  }
}
