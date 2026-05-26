'use client';

import { useQuery } from '@tanstack/react-query';
import { MessCatererService } from '@/lib/services/campus-living/mess-caterer-service';

/**
 * Returns the active caterer that serves a given resident gender for an
 * institution. Used by reports + billing + the resident-facing menu view
 * to pick the right cooker once tier (menu cell) is identified.
 *
 * 6hr staleTime — caterer assignment changes once per contract cycle
 * (semesterly or longer).
 */
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export const messCatererByGenderKeys = {
  all: ['mess-caterers', 'by-gender'] as const,
  byGender: (institutionId: string, gender: 'boys' | 'girls') =>
    ['mess-caterers', 'by-gender', institutionId, gender] as const,
};

export function useMessCatererForGender(
  institutionId: string | undefined,
  gender: 'boys' | 'girls' | undefined,
) {
  const enabled = !!institutionId && !!gender;
  return useQuery({
    queryKey: messCatererByGenderKeys.byGender(institutionId ?? 'all', (gender ?? 'boys') as 'boys' | 'girls'),
    queryFn: () => MessCatererService.getCatererForGender(institutionId!, gender!),
    enabled,
    staleTime: SIX_HOURS_MS,
  });
}
