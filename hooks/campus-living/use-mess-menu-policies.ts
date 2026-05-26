'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getMessMenuPolicySnapshot,
  type MessMenuPolicySnapshot,
} from '@/lib/services/campus-living/mess-menu-policy-service';

/**
 * Fetches all 6 mess.menu.* policy values in one round-trip. Used by the
 * admin policies page (PR 4) and any service-layer caller that needs the
 * whole snapshot up-front (e.g. the resident menu view checking
 * tier_crossing_allowed before rendering tier picker).
 *
 * 1hr staleTime — policy edits are a once-per-day Director event.
 */
const ONE_HOUR_MS = 60 * 60 * 1000;

export const messMenuPolicyKeys = {
  all: ['mess-menu-policies'] as const,
  snapshot: (institutionId: string | null | undefined) =>
    ['mess-menu-policies', 'snapshot', institutionId ?? 'global'] as const,
};

export function useMessMenuPolicies(institutionId?: string | null) {
  return useQuery<MessMenuPolicySnapshot>({
    queryKey: messMenuPolicyKeys.snapshot(institutionId),
    queryFn: () => getMessMenuPolicySnapshot(institutionId ?? null),
    staleTime: ONE_HOUR_MS,
  });
}
