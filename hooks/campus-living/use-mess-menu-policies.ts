'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  MESS_MENU_POLICY_KEYS,
  getMessMenuPolicySnapshot,
  updateMessMenuPolicy,
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

export type MessMenuPolicyKey = typeof MESS_MENU_POLICY_KEYS[keyof typeof MESS_MENU_POLICY_KEYS];

/**
 * Update a single mess.menu.* policy value at global scope. Invalidates the
 * snapshot cache on success.
 */
export function useUpdateMessMenuPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyKey, value }: { policyKey: MessMenuPolicyKey; value: number | string | boolean }) =>
      updateMessMenuPolicy(policyKey, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messMenuPolicyKeys.all });
      toast.success('Policy updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update policy: ${error.message}`);
    },
  });
}
