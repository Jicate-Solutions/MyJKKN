// hooks/accreditation/use-accreditation-scoreboard.ts
// ============================================================================
// React Query hooks for the /accreditation/* landing + coverage dashboard.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { AccreditationService } from '@/lib/services/accreditation/accreditation-service';

export const accreditationKeys = {
  all: ['accreditation'] as const,
  scoreboard: () => [...accreditationKeys.all, 'scoreboard'] as const,
  coverage: () => [...accreditationKeys.all, 'coverage'] as const,
};

/**
 * Landing page scoreboard — one row per body with metric/evidence counts.
 * Stale time 5 min — data changes only as new metrics are seeded or
 * triggers emit new evidence rows.
 */
export function useAccreditationScoreboard() {
  return useQuery({
    queryKey: accreditationKeys.scoreboard(),
    queryFn: () => AccreditationService.getLandingScoreboard(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Coverage matrix — one row per (body, institution) combination.
 * Same stale time; different query key so landing + coverage refresh
 * independently.
 */
export function useAccreditationCoverage() {
  return useQuery({
    queryKey: accreditationKeys.coverage(),
    queryFn: () => AccreditationService.getCoverageMatrix(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
