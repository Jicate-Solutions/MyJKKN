// hooks/admission/use-campaign-roi.ts
// React Query hooks for Campaign ROI Attribution

import { useQuery } from '@tanstack/react-query';
import {
  CampaignROIService,
  type ROIFilters,
  type AttributionChannel,
} from '@/lib/services/admission/campaign-roi-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const campaignROIKeys = {
  all: ['campaign-roi'] as const,
  campaigns: () => [...campaignROIKeys.all, 'campaigns'] as const,
  campaignsList: (filters: ROIFilters) => [...campaignROIKeys.campaigns(), filters] as const,
  summary: (institutionId: string, from?: string, to?: string) =>
    [...campaignROIKeys.all, 'summary', institutionId, from, to] as const,
  channels: (institutionId: string, from?: string, to?: string) =>
    [...campaignROIKeys.all, 'channels', institutionId, from, to] as const,
  funnel: (campaignId: string) => [...campaignROIKeys.all, 'funnel', campaignId] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

export function useCampaignROI(filters: ROIFilters) {
  const query = useQuery({
    queryKey: campaignROIKeys.campaignsList(filters),
    queryFn: () => CampaignROIService.getCampaignROI(filters),
    enabled: !!filters.institutionId,
  });

  return {
    campaigns: query.data?.campaigns || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useROISummary(params: {
  institutionId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const query = useQuery({
    queryKey: campaignROIKeys.summary(
      params.institutionId || '',
      params.fromDate,
      params.toDate
    ),
    queryFn: () =>
      CampaignROIService.getROISummary({
        institutionId: params.institutionId!,
        fromDate: params.fromDate,
        toDate: params.toDate,
      }),
    enabled: !!params.institutionId,
  });

  return {
    summary: query.data || {
      total_campaigns: 0,
      total_spent: 0,
      total_leads_generated: 0,
      total_applications: 0,
      total_enrollments: 0,
      overall_roi: 0,
      avg_cost_per_lead: 0,
      avg_cost_per_enrollment: 0,
      best_performing_channel: null,
    },
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useChannelComparison(params: {
  institutionId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const query = useQuery({
    queryKey: campaignROIKeys.channels(
      params.institutionId || '',
      params.fromDate,
      params.toDate
    ),
    queryFn: () =>
      CampaignROIService.getChannelComparison({
        institutionId: params.institutionId!,
        fromDate: params.fromDate,
        toDate: params.toDate,
      }),
    enabled: !!params.institutionId,
  });

  return {
    channels: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useConversionFunnel(campaignId?: string) {
  const query = useQuery({
    queryKey: campaignROIKeys.funnel(campaignId || ''),
    queryFn: () => CampaignROIService.getConversionFunnel(campaignId!),
    enabled: !!campaignId,
  });

  return {
    funnel: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
