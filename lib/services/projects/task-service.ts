/**
 * Task Service
 *
 * CRUD + status transitions + assignment + comments + subtasks for
 * project_tasks and its child tables.
 *
 * Pattern: static class, SupabaseClient as first arg. Errors are thrown.
 * Spec: specs/pm-projects-module-2026-05-26.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProjectTask,
  ProjectTaskInsert,
  ProjectTaskUpdate,
  ProjectTaskAssignee,
  ProjectTaskComment,
  ProjectTaskSubtask,
  TaskFilters,
  TaskStatusKey,
} from '@/types/projects';

export class TaskService {
  // ─── Tasks ──────────────────────────────────────────────────────────────────

  static async listTasks(
    supabase: SupabaseClient,
    filters: TaskFilters = {}
  ): Promise<ProjectTask[]> {
    let query = supabase
      .from('project_tasks')
      .select('*')
      .order('order_index', { ascending: true });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.phaseId !== undefined) {
      query = filters.phaseId === null
        ? query.is('phase_id', null)
        : query.eq('phase_id', filters.phaseId);
    }
    if (filters.milestoneId !== undefined) {
      query = filters.milestoneId === null
        ? query.is('milestone_id', null)
        : query.eq('milestone_id', filters.milestoneId);
    }
    if (filters.statusKey) {
      query = query.eq('status_key', filters.statusKey);
    }
    if (filters.taskType) {
      query = query.eq('task_type', filters.taskType);
    }
    if (filters.priorityId) {
      query = query.eq('priority_id', filters.priorityId);
    }
    if (filters.ownerStaffId) {
      query = query.eq('owner_staff_id', filters.ownerStaffId);
    }
    if (filters.isBlocked !== undefined && filters.isBlocked !== null) {
      query = query.eq('is_blocked', filters.isBlocked);
    }
    if (filters.isOverdue !== undefined && filters.isOverdue !== null) {
      query = query.eq('is_overdue', filters.isOverdue);
    }
    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectTask[];
  }

  static async getTask(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectTask | null> {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectTask | null;
  }

  static async createTask(
    supabase: SupabaseClient,
    input: ProjectTaskInsert
  ): Promise<ProjectTask> {
    const { data, error } = await supabase
      .from('project_tasks')
      .insert(input)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectTask;
  }

  static async updateTask(
    supabase: SupabaseClient,
    id: string,
    input: ProjectTaskUpdate
  ): Promise<ProjectTask> {
    const { data, error } = await supabase
      .from('project_tasks')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectTask;
  }

  /**
   * Move a task to a new board column / status key. Stamps completed_at when
   * the caller flags the move as a completion; clears it otherwise.
   */
  static async updateStatus(
    supabase: SupabaseClient,
    id: string,
    statusKey: TaskStatusKey,
    isComplete = false
  ): Promise<ProjectTask> {
    const { data, error } = await supabase
      .from('project_tasks')
      .update({
        status_key: statusKey,
        completed_at: isComplete ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectTask;
  }

  // ─── Assignment ───────────────────────────────────────────────────────────────

  static async listAssignees(
    supabase: SupabaseClient,
    taskId: string
  ): Promise<ProjectTaskAssignee[]> {
    const { data, error } = await supabase
      .from('project_task_assignees')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as ProjectTaskAssignee[];
  }

  static async assign(
    supabase: SupabaseClient,
    taskId: string,
    staffId: string,
    role = 'assignee',
    assignedBy?: string | null
  ): Promise<ProjectTaskAssignee> {
    const { data, error } = await supabase
      .from('project_task_assignees')
      .insert({
        task_id: taskId,
        staff_id: staffId,
        role,
        ...(assignedBy ? { assigned_by: assignedBy } : {}),
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectTaskAssignee;
  }

  static async unassign(
    supabase: SupabaseClient,
    taskId: string,
    staffId: string
  ): Promise<void> {
    const { error } = await supabase
      .from('project_task_assignees')
      .delete()
      .eq('task_id', taskId)
      .eq('staff_id', staffId);

    if (error) throw error;
  }

  // ─── Comments ─────────────────────────────────────────────────────────────────

  static async listComments(
    supabase: SupabaseClient,
    taskId: string
  ): Promise<ProjectTaskComment[]> {
    const { data, error } = await supabase
      .from('project_task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as ProjectTaskComment[];
  }

  static async addComment(
    supabase: SupabaseClient,
    taskId: string,
    body: string,
    parentCommentId?: string | null
  ): Promise<ProjectTaskComment> {
    const { data, error } = await supabase
      .from('project_task_comments')
      .insert({
        task_id: taskId,
        body,
        ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}),
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectTaskComment;
  }

  // ─── Subtasks ─────────────────────────────────────────────────────────────────

  static async listSubtasks(
    supabase: SupabaseClient,
    taskId: string
  ): Promise<ProjectTaskSubtask[]> {
    const { data, error } = await supabase
      .from('project_task_subtasks')
      .select('*')
      .eq('task_id', taskId)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return (data ?? []) as ProjectTaskSubtask[];
  }

  static async addSubtask(
    supabase: SupabaseClient,
    taskId: string,
    title: string,
    orderIndex = 0
  ): Promise<ProjectTaskSubtask> {
    const { data, error } = await supabase
      .from('project_task_subtasks')
      .insert({ task_id: taskId, title, order_index: orderIndex })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectTaskSubtask;
  }

  static async toggleSubtask(
    supabase: SupabaseClient,
    subtaskId: string,
    isComplete: boolean
  ): Promise<ProjectTaskSubtask> {
    const { data, error } = await supabase
      .from('project_task_subtasks')
      .update({ is_complete: isComplete })
      .eq('id', subtaskId)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectTaskSubtask;
  }
}
