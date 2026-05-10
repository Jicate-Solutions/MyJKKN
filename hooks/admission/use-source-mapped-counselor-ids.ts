// hooks/admission/use-source-mapped-counselor-ids.ts
//
// Returns a Set of profile_ids (user_ids) of counselors mapped to the given
// source enum within an institution. Used by the lead-detail "Assign
// Counselor" dialog to group source-mapped counselors at the top of the
// picker so admins can see which counselors are configured for this lead's
// source without leaving the page.

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';

export function useSourceMappedCounselorIds(input: {
  sourceEnum?: LeadSourceEnum | null;
  institutionId?: string | null;
  enabled?: boolean;
}) {
  const { sourceEnum, institutionId, enabled = true } = input;
  return useQuery<Set<string>>({
    queryKey: ['source-mapped-counselor-ids', sourceEnum ?? '__none__', institutionId ?? '__all__'],
    enabled: enabled && !!sourceEnum,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      let q = (supabase as any)
        .from('admission_counselor_sources')
        .select(
          `
          counselor:admission_counselors!counselor_id (
            user_id, institution_id, is_active
          ),
          source:admission_lead_sources_master!source_id (
            enum_value, is_active
          ),
          is_paused,
          effective_from,
          effective_to
          `
        )
        .eq('is_paused', false);

      const { data, error } = await q;
      if (error) throw error;

      const now = new Date();
      const ids = new Set<string>();
      for (const row of (data ?? []) as any[]) {
        if (row.source?.enum_value !== sourceEnum) continue;
        if (row.source?.is_active !== true) continue;
        if (row.counselor?.is_active !== true) continue;
        if (institutionId && row.counselor?.institution_id !== institutionId) continue;
        if (row.effective_from && new Date(row.effective_from) > now) continue;
        if (row.effective_to && new Date(row.effective_to) <= now) continue;
        if (row.counselor?.user_id) ids.add(row.counselor.user_id);
      }
      return ids;
    },
  });
}
