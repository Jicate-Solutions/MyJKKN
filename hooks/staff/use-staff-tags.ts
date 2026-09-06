// hooks/staff/use-staff-tags.ts

import { useQuery } from '@tanstack/react-query';
import { StaffService } from '@/lib/services/staff/staff-service';

/**
 * Distinct staff tags currently in use, for the tags-input autocomplete.
 *
 * Optionally scoped to one institution. Suggesting tags that already exist
 * curbs spelling drift, which keeps the external API's `?tags=` filter
 * predictable (it matches on exact, lowercased strings).
 */
export function useStaffTags(institutionId?: string) {
  return useQuery({
    queryKey: ['staff', 'tags', institutionId ?? 'all'],
    queryFn: () => StaffService.getDistinctTags(institutionId),
    // Tags change rarely; cache generously to avoid refetching on every
    // keystroke / form mount.
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000 // 10 minutes
  });
}
