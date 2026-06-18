'use client';

// hooks/meetings/use-meeting-analytics.ts
// React Query hooks for Module 8 — Meetings Analytics.
//
// Both queries take an ISO [from, to) range. The read TIER is resolved from the
// caller's permissions (usePermissions → getModuleScope('meetings') +
// isSuperAdmin), mapped via resolveAnalyticsTier:
//   * 'own'         host    — own bookings only
//   * 'institution' manager — all hosts in their accessible institution(s),
//                             optionally narrowed by a selected institution
//   * 'all'         admin   — everything
// The database RPCs re-derive and enforce the real boundary; the client tier
// only picks the read path + UI. Hooks gate on having a logged-in session AND a
// resolved (non-loading) permission set so the correct RPC is chosen first try.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MeetingAnalyticsService,
  resolveAnalyticsTier,
  type AnalyticsTier,
  type MeetingsModuleScope,
} from '@/lib/services/meetings/meeting-analytics-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

export const meetingAnalyticsKeys = {
  all: ['meeting-analytics'] as const,
  summary: (from: string, to: string, tier: AnalyticsTier, instKey: string) =>
    ['meeting-analytics', 'summary', tier, instKey, from, to] as const,
  routing: (from: string, to: string, tier: AnalyticsTier, instKey: string) =>
    ['meeting-analytics', 'routing', tier, instKey, from, to] as const,
};

/**
 * Resolve the caller's analytics tier (own | institution | all) from the
 * canonical permission layer. Also surfaces whether permissions are still
 * loading, so consumers can hold the query until the tier is known.
 */
export function useMeetingAnalyticsTier(): {
  tier: AnalyticsTier;
  isResolving: boolean;
} {
  const { isSuperAdmin, getModuleScope, isLoading } = usePermissions();
  const tier = useMemo(() => {
    const scope = getModuleScope('meetings') as MeetingsModuleScope;
    return resolveAnalyticsTier(scope, isSuperAdmin);
  }, [getModuleScope, isSuperAdmin]);
  return { tier, isResolving: isLoading };
}

/** Stable key for the selected-institution dimension of the query cache. */
function instCacheKey(ids: string[] | null): string {
  return ids && ids.length > 0 ? [...ids].sort().join(',') : 'all';
}

export function useMeetingAnalyticsSummary(
  from: string,
  to: string,
  options?: { tier?: AnalyticsTier; institutionIds?: string[] | null }
) {
  const { profile } = useAuth();
  const { tier: resolvedTier, isResolving } = useMeetingAnalyticsTier();
  const tier = options?.tier ?? resolvedTier;
  const institutionIds = options?.institutionIds ?? null;

  return useQuery({
    queryKey: meetingAnalyticsKeys.summary(from, to, tier, instCacheKey(institutionIds)),
    queryFn: () => MeetingAnalyticsService.getSummary(from, to, tier, institutionIds),
    // Wait until the tier is known (permissions resolved) so we don't fire the
    // 'own' RPC first and then refetch as 'institution'.
    enabled: !!profile && !!from && !!to && (!!options?.tier || !isResolving),
    staleTime: 60_000,
  });
}

export function useMeetingRoutingDistribution(
  from: string,
  to: string,
  options?: { tier?: AnalyticsTier; institutionIds?: string[] | null }
) {
  const { profile } = useAuth();
  const { tier: resolvedTier, isResolving } = useMeetingAnalyticsTier();
  const tier = options?.tier ?? resolvedTier;
  const institutionIds = options?.institutionIds ?? null;

  return useQuery({
    queryKey: meetingAnalyticsKeys.routing(from, to, tier, instCacheKey(institutionIds)),
    queryFn: () =>
      MeetingAnalyticsService.getRoutingDistribution(from, to, tier, institutionIds),
    enabled: !!profile && !!from && !!to && (!!options?.tier || !isResolving),
    staleTime: 60_000,
  });
}
