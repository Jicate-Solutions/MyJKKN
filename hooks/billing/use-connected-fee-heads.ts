'use client';

// useConnectedFeeHeads — which fee heads (billing_categories.kind) can be paid
// ONLINE at an institution. Backs the Pay Online bill filter: bills whose head
// has no connected Razorpay account are hidden from online payment and settled
// manually. Goes through the API route (razorpay_accounts is service-role-only,
// so no client-side Supabase query can answer this).

import { useQuery } from '@tanstack/react-query';

export interface ConnectedFeeHeads {
  /** Fee heads with a usable head-specific account (e.g. ['tuition','transport']). */
  feeHeads: string[];
  /** True only when a DEFAULT vault account (fee_head NULL) covers every head. */
  allConnected: boolean;
}

export const connectedFeeHeadKeys = {
  all: ['billing', 'connected-fee-heads'] as const,
  byInstitution: (institutionId: string) =>
    [...connectedFeeHeadKeys.all, institutionId] as const,
};

export function useConnectedFeeHeads(institutionId: string | null | undefined) {
  return useQuery<ConnectedFeeHeads, Error>({
    queryKey: connectedFeeHeadKeys.byInstitution(institutionId ?? ''),
    queryFn: async () => {
      const res = await fetch(
        `/api/billing/payment-accounts/connected?institutionId=${encodeURIComponent(institutionId!)}`,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to check online payment availability');
      }
      return json.data as ConnectedFeeHeads;
    },
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });
}
