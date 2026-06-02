import { useQuery } from '@tanstack/react-query';
import {
  YoYTrajectoryService,
  type YoYTrajectoryPayload,
  type YoYInstitutionRow,
  type YoYDrillRow,
  type YoYCategoryRow,
} from '@/lib/services/admission/yoy-trajectory-service';

export const yoyTrajectoryKeys = {
  all: ['admission', 'yoy-trajectory'] as const,
  scope: (institutionId?: string) =>
    [...yoyTrajectoryKeys.all, institutionId ?? 'group'] as const,
  perInstitution: (year: number, institutionId?: string) =>
    [...yoyTrajectoryKeys.all, 'per-institution', year, institutionId ?? 'group'] as const,
  drillAtDay: (year: number, dayN: number, institutionId?: string) =>
    [...yoyTrajectoryKeys.all, 'drill', year, dayN, institutionId ?? 'group'] as const,
  perCategory: (institutionId?: string) =>
    [...yoyTrajectoryKeys.all, 'per-category', institutionId ?? 'group'] as const,
};

const FIVE_MIN = 5 * 60 * 1000;

/** Default group-wide YoY trajectory + excluded-courses metadata. */
export function useYoYTrajectory(institutionId?: string) {
  return useQuery<YoYTrajectoryPayload>({
    queryKey: yoyTrajectoryKeys.scope(institutionId),
    queryFn: () => YoYTrajectoryService.getTrajectory(institutionId),
    staleTime: FIVE_MIN,
    refetchOnWindowFocus: false,
  });
}

/** Per-institution sub-trajectories for ONE year. Click-legend expansion. */
export function useYoYPerInstitutionTrajectory(year: number | null, institutionId?: string) {
  return useQuery<YoYInstitutionRow[]>({
    queryKey: yoyTrajectoryKeys.perInstitution(year ?? -1, institutionId),
    queryFn: () => YoYTrajectoryService.getPerInstitutionTrajectory(year as number, institutionId),
    staleTime: FIVE_MIN,
    refetchOnWindowFocus: false,
    enabled: year !== null,
  });
}

/** Top 5 institutions + top 5 programs at (year, day_n). Click-point Sheet. */
export function useYoYDrillAtDay(
  year: number | null,
  dayN: number | null,
  institutionId?: string,
) {
  return useQuery<YoYDrillRow[]>({
    queryKey: yoyTrajectoryKeys.drillAtDay(year ?? -1, dayN ?? -9999, institutionId),
    queryFn: () =>
      YoYTrajectoryService.getDrillAtDay(year as number, dayN as number, institutionId),
    staleTime: FIVE_MIN,
    refetchOnWindowFocus: false,
    enabled: year !== null && dayN !== null,
  });
}

/** Per-category trajectory across all 3 comparison years. Category toggle. */
export function useYoYPerCategoryTrajectory(institutionId?: string) {
  return useQuery<YoYCategoryRow[]>({
    queryKey: yoyTrajectoryKeys.perCategory(institutionId),
    queryFn: () => YoYTrajectoryService.getPerCategoryTrajectory(institutionId),
    staleTime: FIVE_MIN,
    refetchOnWindowFocus: false,
  });
}
