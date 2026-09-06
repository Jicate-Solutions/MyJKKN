'use client';

/**
 * Projects — React Query Hooks
 *
 * Wraps ProjectService with React Query caching + invalidation.
 * Masters (types/statuses/priorities) cache with staleTime Infinity since they
 * change rarely and only via admin CRUD.
 *
 * Pattern: hooks/hr/recruitment-need/use-recruitment-signal.ts
 * (createClientSupabaseClient + query-key factory + invalidate on mutate).
 * Spec: specs/pm-projects-module-2026-05-26.md
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ProjectService } from '@/lib/services/projects/project-service';
import type {
  ProjectFilters,
  ProjectInsert,
  ProjectUpdate,
} from '@/types/projects';

const MASTER_STALE_TIME = Infinity; // types/statuses/priorities change only via admin
const PROJECT_STALE_TIME = 30_000;   // 30 s — back-nav is instant; mutations still invalidate immediately
const PROJECT_GC_TIME = 5 * 60_000; // keep unused entries 5 min so tab-switches don't refetch

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filters: ProjectFilters) => [...projectKeys.lists(), filters] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
  types: () => [...projectKeys.all, 'types'] as const,
  statuses: () => [...projectKeys.all, 'statuses'] as const,
  priorities: () => [...projectKeys.all, 'priorities'] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useProjects(filters: ProjectFilters = {}) {
  return useQuery({
    queryKey: projectKeys.list(filters),
    queryFn: () => ProjectService.listProjects(getSupabase(), filters),
    staleTime: PROJECT_STALE_TIME,
    gcTime: PROJECT_GC_TIME,
  });
}

export function useProject(id: string | null | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? ''),
    queryFn: () => ProjectService.getProject(getSupabase(), id as string),
    enabled: !!id,
    staleTime: PROJECT_STALE_TIME,
    gcTime: PROJECT_GC_TIME,
  });
}

export function useProjectTypes(includeInactive = false) {
  return useQuery({
    queryKey: [...projectKeys.types(), includeInactive],
    queryFn: () => ProjectService.listProjectTypes(getSupabase(), includeInactive),
    staleTime: MASTER_STALE_TIME,
  });
}

export function useProjectStatuses(includeInactive = false) {
  return useQuery({
    queryKey: [...projectKeys.statuses(), includeInactive],
    queryFn: () => ProjectService.listProjectStatuses(getSupabase(), includeInactive),
    staleTime: MASTER_STALE_TIME,
  });
}

export function useProjectPriorities(includeInactive = false) {
  return useQuery({
    queryKey: [...projectKeys.priorities(), includeInactive],
    queryFn: () => ProjectService.listProjectPriorities(getSupabase(), includeInactive),
    staleTime: MASTER_STALE_TIME,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────────

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProjectInsert) =>
      ProjectService.createProject(getSupabase(), input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProjectUpdate }) =>
      ProjectService.updateProject(getSupabase(), id, input),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) });
    },
  });
}

export function useCancelProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      reason,
      cancelledBy,
    }: {
      id: string;
      reason: string;
      cancelledBy?: string | null;
    }) => ProjectService.cancelProject(getSupabase(), id, reason, cancelledBy),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) });
    },
  });
}
