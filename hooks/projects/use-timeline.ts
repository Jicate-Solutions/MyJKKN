'use client';

/**
 * Timeline — React Query Hooks
 *
 * Wraps TimelineService for phases / milestones / dependencies. Tasks come from
 * the existing useTasks hook; drag-to-move uses the existing useUpdateTask. This
 * file only adds the read hooks the Gantt needs beyond the task list.
 *
 * Pattern: hooks/projects/use-tasks.ts (query-key factory + enabled gating).
 * Spec: specs/pm-projects-module-2026-05-26.md (Feature F2)
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { TimelineService } from '@/lib/services/projects/timeline-service';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const timelineKeys = {
  all: ['project-timeline'] as const,
  phases: (projectId: string) => [...timelineKeys.all, 'phases', projectId] as const,
  milestones: (projectId: string) => [...timelineKeys.all, 'milestones', projectId] as const,
  dependencies: (projectId: string) =>
    [...timelineKeys.all, 'dependencies', projectId] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useProjectPhases(projectId: string | null | undefined) {
  return useQuery({
    queryKey: timelineKeys.phases(projectId ?? ''),
    queryFn: () => TimelineService.listPhases(getSupabase(), projectId as string),
    enabled: !!projectId,
  });
}

export function useProjectMilestones(projectId: string | null | undefined) {
  return useQuery({
    queryKey: timelineKeys.milestones(projectId ?? ''),
    queryFn: () => TimelineService.listMilestones(getSupabase(), projectId as string),
    enabled: !!projectId,
  });
}

export function useTaskDependencies(projectId: string | null | undefined) {
  return useQuery({
    queryKey: timelineKeys.dependencies(projectId ?? ''),
    queryFn: () => TimelineService.listDependencies(getSupabase(), projectId as string),
    enabled: !!projectId,
  });
}
