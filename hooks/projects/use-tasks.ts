'use client';

/**
 * Tasks — React Query Hooks
 *
 * Wraps TaskService. Task mutations invalidate BOTH the task keys and the parent
 * project keys (task changes roll up into project percent_complete / RAG).
 *
 * Pattern: hooks/hr/recruitment-need/use-recruitment-signal.ts
 * Spec: specs/pm-projects-module-2026-05-26.md
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { TaskService } from '@/lib/services/projects/task-service';
import { projectKeys } from '@/hooks/projects/use-projects';
import type {
  TaskFilters,
  ProjectTaskInsert,
  ProjectTaskUpdate,
  TaskStatusKey,
} from '@/types/projects';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const taskKeys = {
  all: ['project-tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters: TaskFilters) => [...taskKeys.lists(), filters] as const,
  byProject: (projectId: string) => [...taskKeys.lists(), 'project', projectId] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useTasks(projectId: string | null | undefined, filters: TaskFilters = {}) {
  const merged: TaskFilters = { ...filters, projectId: projectId ?? filters.projectId ?? null };
  return useQuery({
    queryKey: taskKeys.list(merged),
    queryFn: () => TaskService.listTasks(getSupabase(), merged),
    enabled: !!merged.projectId,
  });
}

export function useTask(id: string | null | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(id ?? ''),
    queryFn: () => TaskService.getTask(getSupabase(), id as string),
    enabled: !!id,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────────

function invalidateTaskAndProject(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  taskId?: string
) {
  queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
  if (taskId) {
    queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
  }
  // Task changes roll up into the project.
  queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
  queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProjectTaskInsert) =>
      TaskService.createTask(getSupabase(), input),
    onSuccess: (task) => {
      invalidateTaskAndProject(queryClient, task.project_id, task.id);
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProjectTaskUpdate }) =>
      TaskService.updateTask(getSupabase(), id, input),
    onSuccess: (task) => {
      invalidateTaskAndProject(queryClient, task.project_id, task.id);
    },
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      statusKey,
      isComplete,
    }: {
      id: string;
      statusKey: TaskStatusKey;
      isComplete?: boolean;
    }) => TaskService.updateStatus(getSupabase(), id, statusKey, isComplete ?? false),
    onSuccess: (task) => {
      invalidateTaskAndProject(queryClient, task.project_id, task.id);
    },
  });
}
