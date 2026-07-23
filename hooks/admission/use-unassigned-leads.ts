// hooks/admission/use-unassigned-leads.ts

'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
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

/**
 * Lazy "fetch all IDs" — used by the Distribute panel's "Select all N leads"
 * button. Returns just {id, institution_id} per row so even tens of thousands
 * of rows transfer in a tiny payload. Exposed as a mutation rather than a
 * query because we don't want it to fire on mount; only on explicit click.
 */
export function useAllUnassignedLeadIdsLazy() {
  return useMutation({
    mutationFn: (input: {
      sourceEnum: LeadSourceEnum;
      institutionId?: string | null;
      filters?: UnassignedLeadFilters;
    }) => LeadDistributionService.listAllUnassignedIds(input),
  });
}
