'use client';

/**
 * Project Templates — React Query Hooks
 *
 * Wraps TemplateService with React Query caching + invalidation.
 * Templates cache with staleTime Infinity (they change only on explicit save/delete).
 * Mutations (save-as-template, create-from-template) invalidate the template list
 * and, where a new project is created, also invalidate the project list.
 *
 * Pattern: hooks/projects/use-risks.ts + use-projects.ts
 * (createClientSupabaseClient + query-key factory + invalidate on mutate).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F10.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { TemplateService } from '@/lib/services/projects/template-service';
import { projectKeys } from '@/hooks/projects/use-projects';
import type {
  TemplateFilters,
  ProjectTemplateInsert,
  ProjectTemplateUpdate,
} from '@/lib/services/projects/template-service';
import type { ProjectInsert } from '@/types/projects';

const TEMPLATE_STALE_TIME = Infinity;

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const templateKeys = {
  all: ['project-templates'] as const,
  lists: () => [...templateKeys.all, 'list'] as const,
  list: (filters: TemplateFilters) => [...templateKeys.lists(), filters] as const,
  details: () => [...templateKeys.all, 'detail'] as const,
  detail: (id: string) => [...templateKeys.details(), id] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useTemplates(filters: TemplateFilters = {}) {
  return useQuery({
    queryKey: templateKeys.list(filters),
    queryFn: () => TemplateService.listTemplates(getSupabase(), filters),
    staleTime: TEMPLATE_STALE_TIME,
  });
}

export function useTemplate(id: string | null | undefined) {
  return useQuery({
    queryKey: templateKeys.detail(id ?? ''),
    queryFn: () => TemplateService.getTemplate(getSupabase(), id as string),
    enabled: !!id,
    staleTime: TEMPLATE_STALE_TIME,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────────

function invalidateTemplateLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectTemplateInsert) =>
      TemplateService.createTemplate(getSupabase(), input),
    onSuccess: () => invalidateTemplateLists(queryClient),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProjectTemplateUpdate }) =>
      TemplateService.updateTemplate(getSupabase(), id, input),
    onSuccess: (template) => {
      invalidateTemplateLists(queryClient);
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(template.id) });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => TemplateService.deleteTemplate(getSupabase(), id),
    onSuccess: () => invalidateTemplateLists(queryClient),
  });
}

/** Snapshot a project as a new template (save-as-template). */
export function useSaveProjectAsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      projectId: string;
      name: string;
      description?: string | null;
      projectTypeId?: string | null;
    }) => TemplateService.saveProjectAsTemplate(getSupabase(), input),
    onSuccess: () => invalidateTemplateLists(queryClient),
  });
}

/** Create a new project from a template's blueprint (create-from-template). */
export function useCreateProjectFromTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      templateId: string;
      projectInput: Omit<ProjectInsert, 'source_template_id'>;
    }) => TemplateService.createProjectFromTemplate(getSupabase(), input),
    onSuccess: () => {
      // A new project was created — invalidate the project list so the nav
      // and any project pickers pick it up.
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}
