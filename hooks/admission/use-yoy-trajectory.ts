import { useQuery } from '@tanstack/react-query';
import {
  YoYTrajectoryService,
  type YoYTrajectoryPayload,
  type YoYInstitutionRow,
  type YoYDrillRow,
  type YoYCategoryRow,
  type YoYHealthSignal,
  type YoYDepositLeak,
  type YoYCounselorGridCell,
  type YoYFirstTouchBreach,
  type YoYDaysToCatchUp,
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
  health: (institutionId?: string) =>
    [...yoyTrajectoryKeys.all, 'health-signals', institutionId ?? 'group'] as const,
  deposits: (institutionId?: string) =>
    [...yoyTrajectoryKeys.all, 'deposits-leaking', institutionId ?? 'group'] as const,
  counselorGrid: (institutionId?: string) =>
    [...yoyTrajectoryKeys.all, 'counselor-grid', institutionId ?? 'group'] as const,
  firstTouch: (institutionId?: string) =>
    [...yoyTrajectoryKeys.all, 'first-touch', institutionId ?? 'group'] as const,
  daysToCatchUp: (institutionId?: string, m?: number, d?: number) =>
    [
      ...yoyTrajectoryKeys.all,
      'days-to-catchup',
      institutionId ?? 'group',
      m ?? 8,
      d ?? 31,
    ] as const,
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

/** 8-college Stoplight health signals. */
export function useYoYInstitutionHealth(institutionId?: string) {
  return useQuery<YoYHealthSignal[]>({
    queryKey: yoyTrajectoryKeys.health(institutionId),
    queryFn: () => YoYTrajectoryService.getInstitutionHealth(institutionId),
    staleTime: FIVE_MIN,
    refetchOnWindowFocus: false,
  });
}

/** Top N programs leaking deposits. */
export function useYoYDepositsLeaking(institutionId?: string, topN = 5) {
  return useQuery<YoYDepositLeak[]>({
    queryKey: [...yoyTrajectoryKeys.deposits(institutionId), topN],
    queryFn: () => YoYTrajectoryService.getDepositsLeaking(institutionId, topN),
    staleTime: FIVE_MIN,
    refetchOnWindowFocus: false,
  });
}

/** institution × counsellor matrix of stale leads. */
export function useYoYCounselorGrid(institutionId?: string) {
  return useQuery<YoYCounselorGridCell[]>({
    queryKey: yoyTrajectoryKeys.counselorGrid(institutionId),
    queryFn: () => YoYTrajectoryService.getCounselorGrid(institutionId),
    staleTime: FIVE_MIN,
    refetchOnWindowFocus: false,
  });
}

/** First-touch SLA breaches (leads not worked within 48h). */
export function useYoYFirstTouchBreaches(institutionId?: string, windowDays = 7) {
  return useQuery<YoYFirstTouchBreach[]>({
    queryKey: [...yoyTrajectoryKeys.firstTouch(institutionId), windowDays],
    queryFn: () => YoYTrajectoryService.getFirstTouchBreaches(institutionId, windowDays),
    staleTime: FIVE_MIN,
    refetchOnWindowFocus: false,
  });
}

/** Per-institution days-to-catch-up countdown vs LY final + window-end. */
export function useYoYDaysToCatchUp(
  institutionId?: string,
  windowEndMonth = 8,
  windowEndDay = 31,
) {
  return useQuery<YoYDaysToCatchUp[]>({
    queryKey: yoyTrajectoryKeys.daysToCatchUp(institutionId, windowEndMonth, windowEndDay),
    queryFn: () =>
      YoYTrajectoryService.getDaysToCatchUp(institutionId, windowEndMonth, windowEndDay),
    staleTime: FIVE_MIN,
    refetchOnWindowFocus: false,
  });
}
