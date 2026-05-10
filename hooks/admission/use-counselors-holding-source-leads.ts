// hooks/admission/use-counselors-holding-source-leads.ts
//
// Lists counselors currently holding ≥1 lead from the given source, with
// counts and a "is_mapped" flag (whether they're formally mapped via
// admission_counselor_sources). Used by the Counselors tab's new
// "Other counselors holding leads from this source" section.

'use client';

import { useQuery } from '@tanstack/react-query';
import { CounselorSourceService } from '@/lib/services/admission/counselor-source-service';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';

export interface CounselorHoldingSourceLeads {
  counselor_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  designation: string | null;
  is_active: boolean | null;
  current_leads: number | null;
  max_leads: number | null;
  source_lead_count: number;
  is_mapped: boolean;
}

export function useCounselorsHoldingSourceLeads(input: {
  sourceEnum?: LeadSourceEnum | null;
  institutionId?: string | null;
  enabled?: boolean;
}) {
  const { sourceEnum, institutionId, enabled = true } = input;
  return useQuery<CounselorHoldingSourceLeads[]>({
    queryKey: [
      'counselors-holding-source-leads',
      sourceEnum ?? '__none__',
      institutionId ?? '__all__',
    ],
    enabled: enabled && !!sourceEnum,
    staleTime: 30_000,
    queryFn: () =>
      CounselorSourceService.listCounselorsHoldingLeads(
        sourceEnum as string,
        institutionId
      ),
  });
}
