import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { InstitutionHealthScore } from '@/types/usage-analytics';

interface UseHealthScoresParams {
  institutionId?: string;
  scoreDate?: string;
  enabled?: boolean;
}

/**
 * Hook to fetch institution health scores.
 */
export function useHealthScores({
  institutionId,
  scoreDate,
  enabled = true,
}: UseHealthScoresParams = {}): UseQueryResult<InstitutionHealthScore[], Error> {
  return useQuery({
    queryKey: ['health-scores', institutionId, scoreDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionId) params.append('institution_id', institutionId);
      if (scoreDate) params.append('score_date', scoreDate);

      const response = await fetch(
        `/api/analytics/usage/health-scores?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch health scores');
      }

      const result = await response.json();
      return result.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

interface UseHealthScoreDetailParams {
  institutionId: string;
  days?: number;
  enabled?: boolean;
}

/**
 * Hook to fetch a single institution's health score with history.
 */
export function useHealthScoreDetail({
  institutionId,
  days = 30,
  enabled = true,
}: UseHealthScoreDetailParams): UseQueryResult<
  { current: InstitutionHealthScore | null; history: InstitutionHealthScore[] },
  Error
> {
  return useQuery({
    queryKey: ['health-score-detail', institutionId, days],
    queryFn: async () => {
      const params = new URLSearchParams({ days: days.toString() });

      const response = await fetch(
        `/api/analytics/usage/health-scores/${institutionId}?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch health score detail');
      }

      const result = await response.json();
      return result.data;
    },
    enabled: enabled && !!institutionId,
    staleTime: 5 * 60 * 1000,
  });
}
