'use client'

import { useQuery } from '@tanstack/react-query'
import { ActivityHubService } from '@/lib/services/campus-living/activity-hub-service'
import type { ActivityFilters } from '@/types/campus-living'

// Query key factory
export const activityHubKeys = {
  all: ['campus-living-activity'] as const,
  recent: (institutionId?: string, filters?: ActivityFilters) =>
    [...activityHubKeys.all, 'recent', institutionId, filters] as const,
}

export function useRecentActivity(institutionId?: string, filters?: ActivityFilters) {
  return useQuery({
    queryKey: activityHubKeys.recent(institutionId, filters),
    queryFn: () => ActivityHubService.getRecentActivity(institutionId, filters),
  })
}
