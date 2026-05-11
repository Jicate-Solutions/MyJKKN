// hooks/admission/use-unassigned-leads.ts

'use client';

import { useQuery } from '@tanstack/react-query';
import {
  LeadDistributionService,
  type UnassignedLead,
} from '@/lib/services/admission/lead-distribution-service';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';

export interface UnassignedLeadFilters {
  stage?: string;
  hot?: boolean;
  search?: string;
}

export function useUnassignedLeads(input: {
  sourceEnum: LeadSourceEnum;
  institutionId?: string | null;
  filters?: UnassignedLeadFilters;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  const { sourceEnum, institutionId, filters = {}, limit = 200, offset = 0, enabled = true } = input;
  return useQuery<{ leads: UnassignedLead[]; totalCount: number }>({
    queryKey: [
      'unassigned-leads',
      sourceEnum,
      institutionId ?? 'all',
      filters.stage ?? '*',
      filters.hot ?? false,
      filters.search ?? '',
      limit,
      offset,
    ],
    queryFn: () =>
      LeadDistributionService.listUnassigned({
        sourceEnum,
        institutionId,
        filters,
        limit,
        offset,
      }),
    enabled,
    staleTime: 15_000,
  });
}
