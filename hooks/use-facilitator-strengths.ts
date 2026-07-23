// hooks/use-facilitator-strengths.ts
// React Query hook for the SCF learning-facilitator STRENGTHS board.
// Self-contained (own query key) so it does not touch hooks/use-session-feedback.ts.
// Mirrors useFacilitatorFeedbackCoverage.

'use client';

import { useQuery } from '@tanstack/react-query';
import { FacilitatorStrengthsService } from '@/lib/services/facilitator-strengths-service';

export const facilitatorStrengthsQueryKeys = {
  all: ['facilitator-strengths'] as const,
  range: (from: string, to: string) =>
    [...facilitatorStrengthsQueryKeys.all, from, to] as const,
};

/** All-college per-learning-facilitator standout 'success' patterns (best first). */
export function useFacilitatorStrengths(from: string, to: string) {
  return useQuery({
    queryKey: facilitatorStrengthsQueryKeys.range(from, to),
    queryFn: () => FacilitatorStrengthsService.getFacilitatorStrengths(from, to),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}
