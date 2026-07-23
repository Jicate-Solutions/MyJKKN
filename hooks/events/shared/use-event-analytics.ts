// hooks/events/shared/use-event-analytics.ts
// React Query hook for the shared event analytics shell (Events Platform Promotion PR8).
// Returns the format-agnostic core metrics; per-format packs (e.g. marathon race analytics)
// stay in their own hooks.

'use client';

import { useQuery } from '@tanstack/react-query';
import { EventAnalyticsService } from '@/lib/services/events/shared/event-analytics-service';

const KEYS = {
  core: (eventId: string) => ['event-analytics', 'core', eventId] as const,
};

export function useEventCoreMetrics(eventId: string) {
  return useQuery({
    queryKey: KEYS.core(eventId),
    queryFn: () => EventAnalyticsService.getCoreMetrics(eventId),
    enabled: !!eventId,
    staleTime: 60_000,
  });
}
