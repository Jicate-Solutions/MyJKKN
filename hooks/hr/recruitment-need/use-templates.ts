'use client';

/**
 * HR Template Library — React Query Hooks
 *
 * Wraps TemplateService with React Query caching.
 * Pattern: matches use-recruitment-signal.ts in this directory.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { TemplateService } from '@/lib/services/hr/recruitment-need/template-service';
import type {
  TemplateFilters,
  HRTemplateInsert,
  HRTemplateUpdate,
  TemplateCategory,
} from '@/types/hr-templates';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const templateKeys = {
  all: ['hr-templates'] as const,
  list: (filters: TemplateFilters) => [...templateKeys.all, 'list', filters] as const,
  detail: (id: string) => [...templateKeys.all, 'detail', id] as const,
};

// ─── Queries ────────────────────────────────────────────────────────────────────

export function useTemplates(filters: TemplateFilters = {}) {
  return useQuery({
    queryKey: templateKeys.list(filters),
    queryFn: () => TemplateService.listTemplates(getSupabase(), filters),
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: () => TemplateService.getTemplate(getSupabase(), id),
    enabled: !!id,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────────

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (insert: HRTemplateInsert) =>
      TemplateService.createTemplate(getSupabase(), insert),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: HRTemplateUpdate }) =>
      TemplateService.updateTemplate(getSupabase(), id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      TemplateService.deleteTemplate(getSupabase(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

export function useIncrementDownload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      TemplateService.incrementDownloadCount(getSupabase(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}
