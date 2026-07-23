'use client';

/**
 * Budget — React Query Hooks
 *
 * Wraps BudgetService + BudgetCategoryService with React Query caching
 * and invalidation. Category list is stale-time Infinity (master data).
 * Line mutations invalidate the project's budget list.
 * Change mutations also invalidate the changes list.
 *
 * Pattern: hooks/projects/use-risks.ts
 * (createClientSupabaseClient + query-key factory + invalidate on mutate).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F6.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  BudgetService,
  BudgetCategoryService,
} from '@/lib/services/projects/budget-service';
import type {
  BudgetFilters,
  BudgetLineInsert,
  BudgetLineUpdate,
  BudgetChangeInsert,
} from '@/lib/services/projects/budget-service';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ──────────────────────────────────────────────────────────────────

export const budgetKeys = {
  all: ['project-budget'] as const,
  categories: () => [...budgetKeys.all, 'categories'] as const,
  lists: () => [...budgetKeys.all, 'list'] as const,
  list: (filters: BudgetFilters) => [...budgetKeys.lists(), filters] as const,
  byProject: (projectId: string) =>
    [...budgetKeys.lists(), 'project', projectId] as const,
  changes: (projectId: string) =>
    [...budgetKeys.all, 'changes', projectId] as const,
  detail: (id: string) => [...budgetKeys.all, 'detail', id] as const,
};

// ─── Category Query ──────────────────────────────────────────────────────────────

export function useBudgetCategories() {
  return useQuery({
    queryKey: budgetKeys.categories(),
    queryFn: () => BudgetCategoryService.listCategories(getSupabase()),
    staleTime: Infinity, // master data — only changes via admin CRUD
  });
}

// ─── Budget Line Queries ─────────────────────────────────────────────────────────

export function useBudgetLines(
  projectId: string | null | undefined,
  filters: BudgetFilters = {}
) {
  const merged: BudgetFilters = {
    ...filters,
    projectId: projectId ?? filters.projectId ?? null,
  };
  return useQuery({
    queryKey: budgetKeys.list(merged),
    queryFn: () => BudgetService.listBudgetLines(getSupabase(), merged),
    enabled: !!merged.projectId,
  });
}

// ─── Budget Changes Query ────────────────────────────────────────────────────────

export function useBudgetChanges(projectId: string | null | undefined) {
  return useQuery({
    queryKey: budgetKeys.changes(projectId ?? ''),
    queryFn: () => BudgetService.listBudgetChanges(getSupabase(), projectId as string),
    enabled: !!projectId,
  });
}

// ─── Budget Line Mutations ───────────────────────────────────────────────────────

function invalidateBudgetLists(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId?: string
) {
  queryClient.invalidateQueries({ queryKey: budgetKeys.lists() });
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: budgetKeys.byProject(projectId) });
  }
}

export function useCreateBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetLineInsert) =>
      BudgetService.createBudgetLine(getSupabase(), input),
    onSuccess: (line) => {
      invalidateBudgetLists(queryClient, line.project_id);
    },
  });
}

export function useUpdateBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BudgetLineUpdate }) =>
      BudgetService.updateBudgetLine(getSupabase(), id, input),
    onSuccess: (line) => {
      invalidateBudgetLists(queryClient, line.project_id);
      queryClient.invalidateQueries({ queryKey: budgetKeys.detail(line.id) });
    },
  });
}

export function useDeleteBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      projectId,
    }: {
      id: string;
      projectId: string;
    }) => BudgetService.deleteBudgetLine(getSupabase(), id),
    onSuccess: (_void, { projectId }) => {
      invalidateBudgetLists(queryClient, projectId);
    },
  });
}

// ─── Budget Change Mutation ──────────────────────────────────────────────────────

export function useRecordBudgetChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetChangeInsert) =>
      BudgetService.recordBudgetChange(getSupabase(), input),
    onSuccess: (change) => {
      queryClient.invalidateQueries({
        queryKey: budgetKeys.changes(change.project_id),
      });
    },
  });
}
