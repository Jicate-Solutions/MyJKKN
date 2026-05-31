'use client';

/**
 * Change Management — React Query Hooks
 *
 * Wraps ChangeService for project change requests. Mutations invalidate
 * their own query keys.
 *
 * Pattern: hooks/projects/use-risks.ts
 * (createClientSupabaseClient + query-key factory + invalidate on mutate).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F14.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ChangeService } from '@/lib/services/projects/change-service';
import type {
  ChangeRequestFilters,
  ChangeRequestInsert,
  ChangeRequestDecision,
} from '@/lib/services/projects/change-service';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const changeKeys = {
  all: ['project-change-requests'] as const,
  lists: () => [...changeKeys.all, 'list'] as const,
  list: (filters: ChangeRequestFilters) => [...changeKeys.lists(), filters] as const,
  byProject: (projectId: string) => [...changeKeys.lists(), 'project', projectId] as const,
  details: () => [...changeKeys.all, 'detail'] as const,
  detail: (id: string) => [...changeKeys.details(), id] as const,
};

// ─── Queries ─────────────────────────────────────────────────────────────────────

export function useChangeRequests(
  projectId: string | null | undefined,
  filters: ChangeRequestFilters = {}
) {
  const merged: ChangeRequestFilters = {
    ...filters,
    projectId: projectId ?? filters.projectId ?? null,
  };
  return useQuery({
    queryKey: changeKeys.list(merged),
    queryFn: () => ChangeService.listChangeRequests(getSupabase(), merged),
    enabled: !!merged.projectId,
  });
}

export function useChangeRequest(id: string | null | undefined) {
  return useQuery({
    queryKey: changeKeys.detail(id ?? ''),
    queryFn: () => ChangeService.getChangeRequest(getSupabase(), id as string),
    enabled: !!id,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────────

function invalidateChangeLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: changeKeys.lists() });
}

export function useCreateChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeRequestInsert) =>
      ChangeService.createChangeRequest(getSupabase(), input),
    onSuccess: () => invalidateChangeLists(queryClient),
  });
}

export function useUpdateChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<ChangeRequestInsert>;
    }) => ChangeService.updateChangeRequest(getSupabase(), id, input),
    onSuccess: (cr) => {
      invalidateChangeLists(queryClient);
      queryClient.invalidateQueries({ queryKey: changeKeys.detail(cr.id) });
    },
  });
}

export function useDecideChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: string;
      decision: ChangeRequestDecision;
    }) => ChangeService.decideChangeRequest(getSupabase(), id, decision),
    onSuccess: (cr) => {
      invalidateChangeLists(queryClient);
      queryClient.invalidateQueries({ queryKey: changeKeys.detail(cr.id) });
    },
  });
}

export function useDeleteChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      ChangeService.deleteChangeRequest(getSupabase(), id),
    onSuccess: () => invalidateChangeLists(queryClient),
  });
}
