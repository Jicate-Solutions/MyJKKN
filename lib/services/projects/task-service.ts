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
  ProjectTaskAssigneeWithStaff,
  ProjectTaskComment,
  ProjectTaskCommentWithAuthor,
  ProjectTaskSubtask,
  TaskFilters,
  TaskStatusKey,
} from '@/types/projects';
import { getCurrentActorId } from './_actor';

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
  ): Promise<ProjectTaskAssigneeWithStaff[]> {
    const { data, error } = await supabase
      .from('project_task_assignees')
      .select('id, task_id, staff_id, role, assigned_by, created_at, staff:staff(id, first_name, last_name)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as unknown as ProjectTaskAssigneeWithStaff[];
  }

  /**
   * Assign a person to a task with a RACI role.
   *
   * Enforces two RACI invariants the meeting engine relies on:
   *  - one role per person per task (re-assigning replaces the person's prior role);
   *  - exactly one Accountable per task (a new Accountable clears the previous one).
   *
   * The delete-then-insert below is the friendly-UX path (it silently replaces
   * rather than erroring on the happy path). As of migration
   * 20260726121724_project_task_assignees_raci_db_constraints.sql, both
   * invariants are ALSO backstopped at the DB layer — uq_project_task_assignees
   * UNIQUE (task_id, staff_id) for one-role-per-person and the partial unique
   * index ix_pta_one_accountable for one-Accountable-per-task — so a concurrent
   * assign that races this delete-then-insert raises 23505 instead of leaving
   * two Accountables. The DB is defense-in-depth; the logic here is unchanged.
   */
  static async assign(
    supabase: SupabaseClient,
    taskId: string,
    staffId: string,
    role = 'responsible',
    assignedBy?: string | null
  ): Promise<ProjectTaskAssignee> {
    // One RACI role per person per task: clear this person's existing assignment.
    await supabase
      .from('project_task_assignees')
      .delete()
      .eq('task_id', taskId)
      .eq('staff_id', staffId);

    // Exactly one Accountable per task (the engine resolves a single owner).
    if (role === 'accountable') {
      await supabase
        .from('project_task_assignees')
        .delete()
        .eq('task_id', taskId)
        .eq('role', 'accountable');
    }

    const { data, error } = await supabase
      .from('project_task_assignees')
      .insert({
        task_id: taskId,
        staff_id: staffId,
        role,
        ...(assignedBy ? { assigned_by: assignedBy } : {}),
      })
      .select('id, task_id, staff_id, role, assigned_by, created_at')
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

  /**
   * Comments oldest-first, each with its author's profile joined.
   *
   * author_id FKs profiles(id); the embed is named so PostgREST resolves the
   * right relationship (created_by also FKs profiles, so an unnamed embed is
   * ambiguous).
   */
  static async listComments(
    supabase: SupabaseClient,
    taskId: string
  ): Promise<ProjectTaskCommentWithAuthor[]> {
    const { data, error } = await supabase
      .from('project_task_comments')
      .select('*, author:profiles!project_task_comments_author_id_fkey(id, full_name, email, avatar_url)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as ProjectTaskCommentWithAuthor[];
  }

  /**
   * author_id has no DB default and no trigger, so it must be set here or every
   * comment is written with a null author.
   */
  static async addComment(
    supabase: SupabaseClient,
    taskId: string,
    body: string,
    parentCommentId?: string | null
  ): Promise<ProjectTaskComment> {
    const actorId = await getCurrentActorId(supabase);
    const { data, error } = await supabase
      .from('project_task_comments')
      .insert({
        task_id: taskId,
        body,
        author_id: actorId,
        created_by: actorId,
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
