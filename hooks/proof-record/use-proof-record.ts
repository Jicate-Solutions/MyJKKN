'use client';

// Verified Skills Record — React Query hooks. The record read goes through
// /api/proof-record (server route: RPC + COE marks overlay); mutations call
// the SECURITY DEFINER RPCs directly (browser client, self-scoped inside).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { ProofDisputeSection, ProofRecordResponse } from '@/types/proof-record';

const KEY = ['proof-record'];

export function useProofRecord() {
  return useQuery<ProofRecordResponse>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch('/api/proof-record');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Could not load your record (${res.status})`);
      }
      return res.json();
    },
    staleTime: 60 * 1000,
  });
}

interface RpcResult {
  success: boolean;
  error?: string;
  token?: string;
}

/** The VSR RPCs return `{ success, error? }` JSONB — refusals are thrown so
 *  React Query surfaces them as mutation errors. */
function unwrap(data: unknown, error: { message: string } | null): RpcResult {
  if (error) throw new Error(error.message);
  const result = data as RpcResult | null;
  if (result && result.success === false) throw new Error(result.error ?? 'Request refused.');
  return result ?? { success: true };
}

export function useOpenDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ section, detail }: { section: ProofDisputeSection; detail: string }) => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_vsr_open_dispute', {
        p_section: section,
        p_detail: detail,
      });
      return unwrap(data, error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreateShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label }: { label: string }) => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_vsr_create_share_token', { p_label: label });
      return unwrap(data, error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRevokeShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tokenId }: { tokenId: string }) => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_vsr_revoke_share_token', {
        p_token_id: tokenId,
      });
      return unwrap(data, error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
