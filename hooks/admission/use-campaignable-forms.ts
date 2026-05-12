// hooks/admission/use-campaignable-forms.ts
// Fetches admission forms that can be linked from campaigns.
// Filtered to published forms whose lead_source matches the campaign's
// source so a Google Ads campaign cannot point at a walk-in-only form.

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LeadSource } from '@/types/admission';

interface MinimalForm {
  id: string;
  name: string;
  slug: string;
  lead_source: LeadSource | null;
}

export function useCampaignableForms(leadSource?: LeadSource) {
  return useQuery({
    queryKey: ['admission-forms', 'campaignable', leadSource] as const,
    queryFn: async (): Promise<MinimalForm[]> => {
      const client = createClientSupabaseClient();
      let q = client
        .from('admission_forms')
        .select('id, name, slug, lead_source')
        .eq('status', 'published')
        .eq('is_active', true);
      if (leadSource) q = q.eq('lead_source', leadSource);
      const { data, error } = await q.order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MinimalForm[];
    },
    staleTime: 60_000,
    enabled: !!leadSource,
  });
}
