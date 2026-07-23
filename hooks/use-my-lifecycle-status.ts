'use client';

// The signed-in learner's own lifecycle status + an `isInductionOnly` flag, used
// to scope the sidebar/bottom-nav for pre-onboarding (induction-only) learners.
// Backed by fn_my_lifecycle_status() (SECURITY DEFINER, returns only the caller's
// own row). The proxy is the real access gate — this is for nav presentation only.
// Spec: specs/pre-onboarding-induction-access-2026-06-29.md
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES } from '@/lib/constants/induction-access';

const INDUCTION_ONLY_SET = new Set<string>(INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES);

/** The caller's learners_profiles.lifecycle_status (null if not a learner). */
export function useMyLifecycleStatus(enabled = true) {
  return useQuery({
    queryKey: ['my-lifecycle-status'],
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_my_lifecycle_status');
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

/** True when the signed-in learner is a pre-onboarding (induction-only) learner. */
export function useIsInductionOnly(enabled = true): boolean {
  const { data } = useMyLifecycleStatus(enabled);
  return !!data && INDUCTION_ONLY_SET.has(data);
}
