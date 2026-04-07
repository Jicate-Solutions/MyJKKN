// hooks/events/marathon/use-marathon-analytics.ts
// React Query hooks for marathon analytics — registration trends, race performance, college ranking.
// Created: 2026-04-07

'use client';

import { useQuery } from '@tanstack/react-query';
import { MarathonAnalyticsService } from '@/lib/services/events/marathon/marathon-analytics-service';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['marathon-analytics'] as const,
  registrations: (eventId: string) =>
    [...KEYS.all, 'registrations', eventId] as const,
  race: (eventId: string) => [...KEYS.all, 'race', eventId] as const,
  college: (eventId: string) => [...KEYS.all, 'college', eventId] as const,
  yoy: (eventId: string) => [...KEYS.all, 'yoy', eventId] as const,
  replay: (eventId: string) => [...KEYS.all, 'replay', eventId] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Registration trend analytics — over-time, by category, institution, gender, source.
 */
export function useRegistrationAnalytics(eventId: string) {
  return useQuery({
    queryKey: KEYS.registrations(eventId),
    queryFn: () => MarathonAnalyticsService.getRegistrationAnalytics(eventId),
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000, // 5 minutes — analytics are not real-time
  });
}

/**
 * Race performance analytics — pace distribution, finish times, DNF stats.
 * Only meaningful after results are published.
 */
export function useRaceAnalytics(eventId: string) {
  return useQuery({
    queryKey: KEYS.race(eventId),
    queryFn: () => MarathonAnalyticsService.getRaceAnalytics(eventId),
    enabled: !!eventId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * College / institution performance leaderboard.
 */
export function useCollegePerformance(eventId: string) {
  return useQuery({
    queryKey: KEYS.college(eventId),
    queryFn: () => MarathonAnalyticsService.getCollegePerformance(eventId),
    enabled: !!eventId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Year-over-year comparison against the previous linked event.
 */
export function useYoYComparison(eventId: string) {
  return useQuery({
    queryKey: KEYS.yoy(eventId),
    queryFn: () => MarathonAnalyticsService.getYoYComparison(eventId),
    enabled: !!eventId,
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * GPS track points for race replay. Large dataset — only fetch on demand.
 */
export function useRaceReplayData(eventId: string, enabled = false) {
  return useQuery({
    queryKey: KEYS.replay(eventId),
    queryFn: () => MarathonAnalyticsService.getRaceReplayData(eventId),
    enabled: !!eventId && enabled,
    staleTime: 30 * 60 * 1000,
  });
}
