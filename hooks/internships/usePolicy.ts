'use client';
// hooks/internships/usePolicy.ts
// React Query hooks for internship policy RPC functions.
// Wraps fn_internship_evaluate_policy and fn_internship_cascade_preview.

import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  getPolicyValue,
  getCascadePreview,
} from '@/lib/services/internships/policy-service';
import type { CascadePreviewChange } from '@/lib/services/internships/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const policyKeys = {
  all: ['internship-policy'] as const,
  value: (key: string, collegeId?: string | null) =>
    [...policyKeys.all, 'value', key, collegeId ?? 'global'] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Resolves the effective policy value for a given key, optionally scoped to a college.
 * Returns the resolved value + cascade audit trail from fn_internship_evaluate_policy.
 */
export function usePolicyValue(key?: string, collegeId?: string | null) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: policyKeys.value(key ?? '', collegeId),
    queryFn: async () => {
      const { data, error } = await getPolicyValue(supabase, key!, collegeId);
      if (error) throw error;
      return data;
    },
    enabled: !!key,
    // Policy values are relatively stable; cache for 2 minutes.
    staleTime: 2 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Returns a mutation that previews the English-language consequences
 * of a batch of proposed policy changes via fn_internship_cascade_preview.
 * This is a read-only preview — it does NOT commit any changes.
 */
export function useCascadePreview() {
  const supabase = createClientSupabaseClient();

  return useMutation({
    mutationFn: (changes: CascadePreviewChange[]) =>
      getCascadePreview(supabase, changes).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to preview policy changes');
    },
  });
}
