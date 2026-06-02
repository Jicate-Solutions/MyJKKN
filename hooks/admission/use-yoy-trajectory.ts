import { useQuery } from '@tanstack/react-query';
import {
  YoYTrajectoryService,
  type YoYTrajectoryPayload,
} from '@/lib/services/admission/yoy-trajectory-service';

export const yoyTrajectoryKeys = {
  all: ['admission', 'yoy-trajectory'] as const,
  scope: (institutionId?: string) =>
    [...yoyTrajectoryKeys.all, institutionId ?? 'group'] as const,
};

/**
 * React Query hook for the YoY trajectory chart. Pulls 3-year cumulative
 * admission curve + excluded-courses metadata (for BDS-style placeholder).
 *
 * Pass `institutionId` for the "My institution only" view, omit for
 * group-wide. 5-min staleTime matches the existing seat-analytics cache
 * pattern.
 */
export function useYoYTrajectory(institutionId?: string) {
  return useQuery<YoYTrajectoryPayload>({
    queryKey: yoyTrajectoryKeys.scope(institutionId),
    queryFn: () => YoYTrajectoryService.getTrajectory(institutionId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
