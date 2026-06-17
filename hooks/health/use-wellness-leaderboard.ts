// hooks/health/use-wellness-leaderboard.ts
// React Query hook for the Wellness Programs competitive section leaderboard.
// Created: 2026-06-15

'use client';

import { useQuery } from '@tanstack/react-query';
import { WellnessLeaderboardService } from '@/lib/services/health/wellness-leaderboard-service';
import type { SectionLeaderboard } from '@/lib/services/health/wellness-leaderboard-service';

const KEYS = {
  leaderboard: (programId: string) => ['wellness-leaderboard', programId] as const,
};

export function useSectionLeaderboard(programId: string | undefined) {
  return useQuery<SectionLeaderboard>({
    queryKey: KEYS.leaderboard(programId || ''),
    queryFn: () => WellnessLeaderboardService.getSectionLeaderboard(programId!),
    enabled: !!programId,
    staleTime: 30_000,
  });
}
