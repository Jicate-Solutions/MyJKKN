'use client';

// hooks/hostel/use-allocation-policies.ts
//
// React Query hooks for the 7 hostel.premium.* / hostel.premium_plus.* rows
// in platform_policies. Surfaces them via a one-shot snapshot for the
// /admin/hostel/allocation-rules editor and gives the Director a single
// mutation entry point keyed by policy_key.
//
// Pattern mirror: hooks/campus-living/use-mess-menu-policies.ts.
// Service: lib/services/hostel/allocation-policy-service.ts.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  HOSTEL_ALLOCATION_POLICY_KEYS,
  getAllocationPolicySnapshot,
  updateAllocationPolicy,
  type HostelAllocationPolicyKey,
  type HostelAllocationPolicySnapshot,
} from '@/lib/services/hostel/allocation-policy-service';

// 1-hour staleTime — policy edits are a once-per-day Director event at most.
const ONE_HOUR_MS = 60 * 60 * 1000;

export const allocationPolicyKeys = {
  all: ['hostel-allocation-policies'] as const,
  snapshot: (institutionId: string | null | undefined) =>
    ['hostel-allocation-policies', 'snapshot', institutionId ?? 'global'] as const,
};

export function useAllocationPolicies(institutionId?: string | null) {
  return useQuery<HostelAllocationPolicySnapshot>({
    queryKey: allocationPolicyKeys.snapshot(institutionId),
    queryFn: () => getAllocationPolicySnapshot(institutionId ?? null),
    staleTime: ONE_HOUR_MS,
  });
}

export { HOSTEL_ALLOCATION_POLICY_KEYS };
export type { HostelAllocationPolicyKey, HostelAllocationPolicySnapshot };

/**
 * Update a single hostel.premium* policy value at global scope. Invalidates
 * the snapshot cache on success. Toasts on success / failure.
 */
export function useUpdateAllocationPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      policyKey,
      value,
    }: {
      policyKey: HostelAllocationPolicyKey;
      value: number | string | boolean | Record<string, unknown>;
    }) => updateAllocationPolicy(policyKey, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: allocationPolicyKeys.all });
      toast.success('Allocation rule updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update rule: ${error.message}`);
    },
  });
}
