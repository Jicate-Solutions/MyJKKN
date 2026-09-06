'use client';

/**
 * Solutions Hub - Solution Repos Hooks
 * Purpose: React Query hooks for GitHub repositories linked to solutions.
 * Capability 1 of the Solutions Hub ↔ intern-repo integration.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  SolutionRepoWithSharing,
  BulkLinkReposResult,
} from '@/lib/services/solutions/solution-repos-service';

export type { SolutionRepoWithSharing, BulkLinkReposResult };

// Key family kept local to avoid touching the shared lib/query-keys.ts registry
// in this PR (pr-preflight overlap hygiene). Same shape as solutionsHubKeys.
export const solutionRepoKeys = {
  all: ['solutions-hub', 'repos'] as const,
  bySolution: (solutionId: string) =>
    [...solutionRepoKeys.all, 'solution', solutionId] as const,
};

/** Repos linked to a solution, each with its "also used by" sharing list. */
export function useSolutionRepos(solutionId: string | undefined) {
  return useQuery<SolutionRepoWithSharing[]>({
    queryKey: solutionRepoKeys.bySolution(solutionId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get('/api/solutions/repos', {
        params: { solution_id: solutionId },
      });
      return (res as { data?: SolutionRepoWithSharing[] })?.data ?? (res as SolutionRepoWithSharing[]);
    },
    enabled: !!solutionId,
    staleTime: 60_000,
  });
}

export function useLinkSolutionRepo(solutionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (repo_full_name: string) =>
      apiClient.post('/api/solutions/repos', {
        solution_id: solutionId,
        repo_full_name,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionRepoKeys.bySolution(solutionId) });
    },
  });
}

/**
 * Link MANY repos in one call. Mirrors useLinkSolutionRepo and invalidates the
 * same query key so the list refreshes. Returns { linked, skipped, invalid }.
 */
export function useBulkLinkRepos(solutionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (repo_full_names: string[]) =>
      apiClient.post<BulkLinkReposResult>('/api/solutions/repos/bulk', {
        solution_id: solutionId,
        repo_full_names,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionRepoKeys.bySolution(solutionId) });
    },
  });
}

export function useUnlinkSolutionRepo(solutionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiClient.delete(`/api/solutions/repos?id=${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionRepoKeys.bySolution(solutionId) });
    },
  });
}
