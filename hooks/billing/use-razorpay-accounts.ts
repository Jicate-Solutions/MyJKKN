'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';

// Mirror of RazorpayAccountSummary (server-only vault type — redeclared here so the
// client bundle doesn't import the server-only module). No secrets.
export interface RazorpayAccountSummary {
  id: string;
  institutionId: string;
  keyId: string;
  accountLabel: string | null;
  mode: 'test' | 'live';
  isActive: boolean;
  webhookRef: string;
  createdAt: string;
  /** billing_categories.kind this account settles; null = institution default. */
  feeHead: string | null;
  mid: string | null;
  tid: string | null;
  dbaName: string | null;
}

export interface UpsertRazorpayAccountInput {
  institutionId: string;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  label?: string;
  mode?: 'test' | 'live';
  /** Fee head (billing_categories.kind); omit/null = institution default account. */
  feeHead?: string | null;
  mid?: string | null;
  tid?: string | null;
  dbaName?: string | null;
}

export interface TestRazorpayAccountResult {
  success: boolean;
  source?: 'institution' | 'env';
  mode?: 'test' | 'live';
  keyId?: string;
  status?: number;
  error?: string;
  message?: string;
}

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export function useRazorpayAccounts() {
  return useQuery({
    queryKey: queryKeys.razorpayAccounts.list(),
    queryFn: async (): Promise<RazorpayAccountSummary[]> => {
      const res = await fetch('/api/billing/payment-accounts');
      const data = await jsonOrThrow(res);
      return data.data as RazorpayAccountSummary[];
    },
  });
}

export function useUpsertRazorpayAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertRazorpayAccountInput): Promise<{ id: string; webhookRef: string }> => {
      const res = await fetch('/api/billing/payment-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await jsonOrThrow(res);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.razorpayAccounts.all }),
  });
}

export function useDeactivateRazorpayAccount() {
  const qc = useQueryClient();
  return useMutation({
    // Deactivate a SPECIFIC account by id (an institution can hold several — one per fee head).
    mutationFn: async (accountId: string): Promise<void> => {
      const res = await fetch('/api/billing/payment-accounts/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      await jsonOrThrow(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.razorpayAccounts.all }),
  });
}

export interface TestRazorpayAccountInput {
  institutionId: string | null;
  /** Resolve the account for this fee head (matches the manager row being tested). */
  feeHead?: string | null;
}

export function useTestRazorpayAccount() {
  return useMutation({
    mutationFn: async (input: TestRazorpayAccountInput): Promise<TestRazorpayAccountResult> => {
      const res = await fetch('/api/billing/payment-accounts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutionId: input.institutionId, feeHead: input.feeHead ?? null }),
      });
      // test endpoint returns 200 with success:false on bad keys — read body directly
      return (await res.json()) as TestRazorpayAccountResult;
    },
  });
}
