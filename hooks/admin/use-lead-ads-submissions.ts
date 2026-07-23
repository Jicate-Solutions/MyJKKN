'use client';

/**
 * useLeadAdsSubmissions — TanStack Query wrapper around
 * `LeadAdsService.listSubmissions()`. Drives the "Received Leads" section
 * on /admission/social/lead-ads.
 *
 * Refetches on a 30s interval (matches the existing events log polling) so
 * the table stays fresh as the importer processes webhooks in the
 * background.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  LeadAdsService,
  type LeadAdsSubmission,
  type ListLeadAdsSubmissionsParams,
} from '@/lib/services/admin/lead-ads-service';

const LEAD_ADS_SUBMISSIONS_KEY = ['lead-ads', 'submissions'] as const;

export function useLeadAdsSubmissions(
  params: ListLeadAdsSubmissionsParams = {}
): UseQueryResult<LeadAdsSubmission[]> {
  return useQuery({
    queryKey: [...LEAD_ADS_SUBMISSIONS_KEY, params],
    queryFn: () => LeadAdsService.listSubmissions(params),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export { LEAD_ADS_SUBMISSIONS_KEY };
