'use client';

/**
 * Solutions Hub - Repo Activity Hook
 * Purpose: live GitHub build activity (open PRs, CI, previews, intern-ready)
 * for the repos linked to a solution. Capability 2 of the intern-repo integration.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { SolutionRepoActivityResult } from '@/lib/services/solutions/repo-activity-service';

export type { SolutionRepoActivityResult };

export const repoActivityKeys = {
  bySolution: (solutionId: string) =>
    ['solutions-hub', 'repo-activity', solutionId] as const,
};

export function useSolutionRepoActivity(solutionId: string | undefined) {
  return useQuery<SolutionRepoActivityResult>({
    queryKey: repoActivityKeys.bySolution(solutionId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get('/api/solutions/repos/activity', {
        params: { solution_id: solutionId },
      });
      return (res as { data?: SolutionRepoActivityResult })?.data ?? (res as SolutionRepoActivityResult);
    },
    enabled: !!solutionId,
    staleTime: 60_000, // spec: 60s client cache over an always-live server fetch
    retry: 1,
  });
}
