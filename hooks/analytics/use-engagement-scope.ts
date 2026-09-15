import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { EngagementScopeChoices } from '@/lib/services/analytics/engagement-scope';

/**
 * The Engagement Analytics filter choices this viewer may use (their own
 * institution, department(s) or sections). The screen hides everything else;
 * the engagement routes enforce the same scope on the server.
 */
export function useEngagementScope(): UseQueryResult<EngagementScopeChoices, Error> {
  return useQuery({
    queryKey: ['engagement-scope'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/engagement/scope');

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to load your engagement access');
      }

      const result = await response.json();
      return result.data as EngagementScopeChoices;
    },
    staleTime: 15 * 60 * 1000
  });
}
