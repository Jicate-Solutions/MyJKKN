'use client';

/**
 * Cross-Institution Projects — React Query Hooks
 *
 * Wraps ProjectInstitutionService for list / add / update-role / remove.
 * Mutations invalidate the per-project institutions list so the table
 * re-fetches automatically.
 *
 * Pattern: hooks/projects/use-risks.ts
 * (createClientSupabaseClient + query-key factory + invalidate on mutate).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F11.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  ProjectInstitutionService,
  type ProjectInstitutionInsert,
  type ProjectInstitutionUpdate,
} from '@/lib/services/projects/project-institution-service';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const projectInstitutionKeys = {
  all: ['project-institutions'] as const,
  byProject: (projectId: string) =>
    [...projectInstitutionKeys.all, 'project', projectId] as const,
};

// ─── Query ───────────────────────────────────────────────────────────────────────

export function useProjectInstitutions(projectId: string | null | undefined) {
  return useQuery({
    queryKey: projectInstitutionKeys.byProject(projectId ?? ''),
    queryFn: () =>
      ProjectInstitutionService.listByProject(
        getSupabase(),
        projectId as string
      ),
    enabled: !!projectId,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────────

function invalidateByProject(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string
) {
  queryClient.invalidateQueries({
    queryKey: projectInstitutionKeys.byProject(projectId),
  });
}

export function useAddProjectInstitution(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectInstitutionInsert) =>
      ProjectInstitutionService.addInstitution(getSupabase(), input),
    onSuccess: () => invalidateByProject(queryClient, projectId),
  });
}

export function useUpdateProjectInstitutionRole(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      update,
    }: {
      id: string;
      update: ProjectInstitutionUpdate;
    }) =>
      ProjectInstitutionService.updateRole(
        getSupabase(),
        id,
        update,
        projectId
      ),
    onSuccess: () => invalidateByProject(queryClient, projectId),
  });
}

export function useRemoveProjectInstitution(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      ProjectInstitutionService.removeInstitution(getSupabase(), id),
    onSuccess: () => invalidateByProject(queryClient, projectId),
  });
}
