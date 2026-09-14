'use client';

import { useQuery } from '@tanstack/react-query';
import { HousekeepingFeedbackGate } from '@/lib/services/campus-living/housekeeping-feedback-gate';

export const housekeepingHoldKeys = {
  all: ['housekeeping-holds'] as const,
  list: (institutionId?: string, blockId?: string, date?: string) =>
    ['housekeeping-holds', 'list', institutionId ?? 'all', blockId ?? 'all', date ?? 'today'] as const,
};

/**
 * Rooms currently blocking attendance because a finished cleaning went unrated.
 * Recomputed on the server every call — there is no stored flag to go stale.
 */
export function useFeedbackHolds(institutionId?: string, blockId?: string, date?: string) {
  return useQuery({
    queryKey: housekeepingHoldKeys.list(institutionId, blockId, date),
    queryFn: () => HousekeepingFeedbackGate.listHolds(institutionId, blockId, date),
  });
}
