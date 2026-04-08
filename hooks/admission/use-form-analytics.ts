// hooks/admission/use-form-analytics.ts
// React Query hooks for form analytics
// Added: 2026-04-08

import { useQuery } from '@tanstack/react-query';
import { FormAnalyticsService } from '@/lib/services/admission/form-analytics-service';

export function useFormAnalyticsSummary(formId: string | undefined) {
  return useQuery({
    queryKey: ['form-analytics-summary', formId],
    queryFn: () => FormAnalyticsService.getFormSummary(formId!),
    enabled: !!formId,
    refetchInterval: 60_000,
  });
}

export function useFieldDropOff(formId: string | undefined) {
  return useQuery({
    queryKey: ['form-field-dropoff', formId],
    queryFn: () => FormAnalyticsService.getFieldDropOff(formId!),
    enabled: !!formId,
  });
}

export function useFormTrafficSources(formId: string | undefined) {
  return useQuery({
    queryKey: ['form-traffic-sources', formId],
    queryFn: () => FormAnalyticsService.getTrafficSources(formId!),
    enabled: !!formId,
  });
}

export function useFormDeviceBreakdown(formId: string | undefined) {
  return useQuery({
    queryKey: ['form-device-breakdown', formId],
    queryFn: () => FormAnalyticsService.getDeviceBreakdown(formId!),
    enabled: !!formId,
  });
}

export function useSubmissionsOverTime(formId: string | undefined, days: number = 30) {
  return useQuery({
    queryKey: ['form-submissions-overtime', formId, days],
    queryFn: () => FormAnalyticsService.getSubmissionsOverTime(formId!, days),
    enabled: !!formId,
  });
}

export function useFormSubmissionCounts(formIds: string[]) {
  return useQuery({
    queryKey: ['form-submission-counts', formIds],
    queryFn: () => FormAnalyticsService.getSubmissionCounts(formIds),
    enabled: formIds.length > 0,
  });
}

export function useFormViewCounts(formIds: string[]) {
  return useQuery({
    queryKey: ['form-view-counts', formIds],
    queryFn: () => FormAnalyticsService.getViewCounts(formIds),
    enabled: formIds.length > 0,
  });
}
