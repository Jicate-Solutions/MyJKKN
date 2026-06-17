'use client';

// hooks/meetings/use-meeting-analytics.ts
// React Query hooks for Module 8 — Meetings Analytics.
// Both queries take an ISO [from, to) range; host-scoping happens server-side
// inside the RPCs, so the hooks only gate on having a logged-in session.

import { useQuery } from '@tanstack/react-query';
import { MeetingAnalyticsService } from '@/lib/services/meetings/meeting-analytics-service';
import { useAuth } from '@/hooks/use-auth';

export const meetingAnalyticsKeys = {
  all: ['meeting-analytics'] as const,
  summary: (from: string, to: string) =>
    ['meeting-analytics', 'summary', from, to] as const,
  routing: (from: string, to: string) =>
    ['meeting-analytics', 'routing', from, to] as const,
};

export function useMeetingAnalyticsSummary(from: string, to: string) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: meetingAnalyticsKeys.summary(from, to),
    queryFn: () => MeetingAnalyticsService.getSummary(from, to),
    enabled: !!profile && !!from && !!to,
    staleTime: 60_000,
  });
}

export function useMeetingRoutingDistribution(from: string, to: string) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: meetingAnalyticsKeys.routing(from, to),
    queryFn: () => MeetingAnalyticsService.getRoutingDistribution(from, to),
    enabled: !!profile && !!from && !!to,
    staleTime: 60_000,
  });
}
