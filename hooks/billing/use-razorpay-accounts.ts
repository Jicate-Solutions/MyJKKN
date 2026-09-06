'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';

// Mirror of RazorpayAccountSummary (server-only vault type — redeclared here so the
// client bundle doesn't import the server-only module). No secrets.
export type RazorpayAccountStatus = 'draft' | 'active' | 'inactive';

export interface RazorpayAccountSummary {
  id: string;
  /** null = GLOBAL account (common to all institutions for its fee head). */
  institutionId: string | null;
  keyId: string | null;
  accountLabel: string | null;
  mode: 'test' | 'live';
  isActive: boolean;
  webhookRef: string | null;
  createdAt: string;
  /** billing_categories.kind this account settles; null = institution default. */
  feeHead: string | null;
  mid: string | null;
  tid: string | null;
  dbaName: string | null;
  status: RazorpayAccountStatus;
}

export interface UpsertRazorpayAccountInput {
  /** null = GLOBAL account; a global account must target a specific fee head. */
  institutionId: string | null;
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

export interface CreateRazorpayDraftInput {
  /** null = GLOBAL account; a global draft must target a specific fee head. */
  institutionId: string | null;
  feeHead?: string | null;
  label?: string;
  mid?: string | null;
  tid?: string | null;
  dbaName?: string | null;
  mode?: 'test' | 'live';
}

// Create/update a DRAFT account (no keys) — stages the institution↔MID mapping.
export function useCreateRazorpayDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRazorpayDraftInput): Promise<{ id: string }> => {
      const res = await fetch('/api/billing/payment-accounts/draft', {
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

export interface ActivateRazorpayAccountInput {
  accountId: string;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

// Activate a draft (add keys) — returns the webhook_ref to paste into Razorpay.
export function useActivateRazorpayAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ActivateRazorpayAccountInput): Promise<{ id: string; webhookRef: string }> => {
      const res = await fetch('/api/billing/payment-accounts/activate', {
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

export interface UpdateRazorpayMetaInput {
  accountId: string;
  label?: string | null;
  mid?: string | null;
  tid?: string | null;
  dbaName?: string | null;
  mode?: 'test' | 'live';
  institutionId?: string | null;
  feeHead?: string | null;
  changeSlot?: boolean;
}

// Edit metadata (label/MID/TID/DBA/mode); slot changes only for drafts with changeSlot.
export function useUpdateRazorpayAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateRazorpayMetaInput): Promise<void> => {
      const res = await fetch('/api/billing/payment-accounts/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      await jsonOrThrow(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.razorpayAccounts.all }),
  });
}

// Hard-delete an account (blocked server-side when transactions pin it).
export function useDeleteRazorpayAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string): Promise<void> => {
      const res = await fetch('/api/billing/payment-accounts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      await jsonOrThrow(res);
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
