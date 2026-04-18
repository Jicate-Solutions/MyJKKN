// ============================================
// ENQUIRY → LEAD → CONSULTANT ATTRIBUTION BRIDGE
// ============================================
// Fetches consultant attributions for a learner profile by going back through
// the admission_leads.learner_profile_id FK. A learner_profile always has at
// most one originating lead (1:1 via this FK), but that lead may have multiple
// consultant attributions (primary / secondary / assist).
//
// This is the read-side of the lead→enquiry conversion bridge. The write side
// lives in /api/admission/bridge/convert.

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { ConsultantLeadAttribution } from '@/types/education-consultants';

export interface EnquiryReferralContext {
  // The originating lead, if any — null if this enquiry was created directly.
  leadId: string | null;
  // Consultant attributions on the lead (empty if no lead or no attributions).
  attributions: ConsultantLeadAttribution[];
}

/**
 * Given a learner_profile id, returns the associated lead + consultant attributions.
 * Used on the enquiry detail page to surface the referral/consultant context that
 * was captured at lead creation time.
 */
export function useEnquiryReferralContext(learnerProfileId?: string) {
  return useQuery<EnquiryReferralContext>({
    queryKey: ['enquiry-referral-context', learnerProfileId],
    queryFn: async () => {
      if (!learnerProfileId) {
        return { leadId: null, attributions: [] };
      }

      const supabase = createClientSupabaseClient();

      // Find the lead that converted into this learner profile.
      const { data: lead } = await (supabase as any)
        .from('admission_leads')
        .select('id')
        .eq('learner_profile_id', learnerProfileId)
        .maybeSingle();

      if (!lead?.id) {
        return { leadId: null, attributions: [] };
      }

      // Fetch attributions for that lead. getLeadAttributions joins consultant data.
      const { data: attributions } = await ConsultantService.getLeadAttributions({
        lead_id: lead.id,
      });

      return {
        leadId: lead.id,
        attributions: attributions || [],
      };
    },
    enabled: !!learnerProfileId,
    staleTime: 60 * 1000,
  });
}
