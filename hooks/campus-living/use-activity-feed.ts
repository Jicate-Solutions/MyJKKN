'use client';

import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { ActivityFeedService } from '@/lib/services/campus-living/activity-feed-service';
import type {
  ActivityFeedFilters,
  ActivityFeedPaginatedResponse,
} from '@/types/campus-living/activity-feed';

// Query key factory — matches the convention used by sibling hooks
// (use-hostel-incidents, use-hostel-blocks, etc.)
export const activityFeedKeys = {
  all: ['campus-living-activity-feed'] as const,
  list: (filters: Record<string, unknown>) =>
    ['campus-living-activity-feed', 'list', filters] as const,
};

export interface UseActivityFeedArgs {
  institutionId: string | undefined;
  filters?: Omit<ActivityFeedFilters, 'institution_id'>;
  page?: number;
  pageSize?: number;
}

/**
 * useActivityFeed — paginated stream of campus-living events.
 *
 * The hook gates on `institutionId` the same way `useHostelIncidents`
 * does: super-admins can query across all institutions (institutionId
 * left undefined → service returns the global stream); everyone else
 * needs a scoped institutionId.
 *
 * Refetch cadence: 30s by default so the page feels "live" without
 * hammering the 5 source tables. Disable by passing the React Query
 * options through if a consumer needs different behaviour (none today).
 */
export function useActivityFeed({
  institutionId,
  filters,
  page = 1,
  pageSize = 50,
}: UseActivityFeedArgs) {
  const { isSuperAdmin } = usePermissions();
  const scopedInstitutionId = isSuperAdmin ? undefined : institutionId;

  return useQuery<ActivityFeedPaginatedResponse>({
    queryKey: activityFeedKeys.list({
      institutionId: scopedInstitutionId,
      page,
      pageSize,
      ...filters,
    }),
    queryFn: () =>
      ActivityFeedService.getActivityFeed(
        {
          ...filters,
          institution_id: scopedInstitutionId,
        },
        page,
        pageSize,
      ),
    enabled: isSuperAdmin || !!institutionId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
