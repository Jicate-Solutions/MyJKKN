// hooks/admission/use-source-captures.ts
// Read the source-capture timeline for a single lead. Backed by
// admission_lead_source_captures (one row per source-channel touch).

import { useQuery } from '@tanstack/react-query';
import { LeadService } from '@/lib/services/admission/lead-service';

export function useSourceCaptures(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-source-captures', leadId],
    queryFn: () => LeadService.getSourceCaptures(leadId as string),
    enabled: !!leadId,
    staleTime: 30_000,
  });
}
