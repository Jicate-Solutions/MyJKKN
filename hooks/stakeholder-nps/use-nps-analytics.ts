/**
 * React Query hooks for NPS Analytics
 */

import { useQuery } from '@tanstack/react-query';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import type { NPSAnalyticsFilters } from '@/types/stakeholder-nps';

export function useNPSSurveyAnalytics(surveyId: string | null) {
  return useQuery({
    queryKey: ['nps-analytics', surveyId],
    queryFn: () => surveyId ? NPSService.getSurveyAnalytics(surveyId) : null,
    enabled: !!surveyId,
    staleTime: 1000 * 60 * 2
  });
}

export function useNPSTrendAnalytics(filters: NPSAnalyticsFilters) {
  return useQuery({
    queryKey: ['nps-trends', filters],
    queryFn: () => NPSService.getTrendAnalytics(filters),
    staleTime: 1000 * 60 * 5
  });
}

export function useNPSTopFeedback(surveyId: string | null) {
  return useQuery({
    queryKey: ['nps-feedback', surveyId],
    queryFn: () => surveyId ? NPSService.getTopFeedback(surveyId) : null,
    enabled: !!surveyId,
    staleTime: 1000 * 60 * 5
  });
}
