// hooks/use-learner-trajectory.ts
// React Query hook for the SCF per-learner trajectory early-warning (#3a).
// Mirrors the hooks in hooks/use-session-feedback.ts (which is left untouched).

'use client';

import { useQuery } from '@tanstack/react-query';
import { ScfLoopService } from '@/lib/services/scf-loop-service';

export const learnerTrajectoryQueryKeys = {
  all: ['scf-learner-trajectory'] as const,
  window: (from: string, to: string, minSessions: number, slopeThreshold: number) =>
    [...learnerTrajectoryQueryKeys.all, from, to, minSessions, slopeThreshold] as const,
};

/** Sliding learners (understanding declining) in scope, worst + at-risk first. */
export function useLearnerTrajectory(
  from: string,
  to: string,
  opts?: { minSessions?: number; slopeThreshold?: number },
) {
  const minSessions = opts?.minSessions ?? 3;
  const slopeThreshold = opts?.slopeThreshold ?? -0.15;
  return useQuery({
    queryKey: learnerTrajectoryQueryKeys.window(from, to, minSessions, slopeThreshold),
    queryFn: () => ScfLoopService.getLearnerTrajectory(from, to, { minSessions, slopeThreshold }),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}
