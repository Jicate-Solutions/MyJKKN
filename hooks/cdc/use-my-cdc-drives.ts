'use client';

import { useQuery } from '@tanstack/react-query';
import type { MyCdcDrive } from '@/app/api/cdc/drives/mine/route';

export type { MyCdcDrive };

/**
 * The campus drives the signed-in learner can act on right now.
 *
 * Returns an empty list for anyone who is not a learner, so the card that uses
 * it can self-hide rather than the caller having to know who is looking.
 */
export function useMyCdcDrives() {
  return useQuery({
    queryKey: ['cdc-my-drives'],
    queryFn: async () => {
      const res = await fetch('/api/cdc/drives/mine');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Campus drives fetch failed: ${res.status}`);
      }
      return ((await res.json()).drives ?? []) as MyCdcDrive[];
    },
    staleTime: 60 * 1000,
  });
}
