'use client';

// Resolves a learner's community_category_id (FK) → the community CODE
// (e.g. 'SC', 'BC', 'MBC') on the client. The legacy `community` text column
// stored this code (set by the FK→text trigger) and is now retired, so display
// surfaces resolve it here. Shares the React Query cache key with the community
// dropdown, so the lookup is fetched once per session.

import { useQuery } from '@tanstack/react-query';
import { LookupService } from '@/lib/services/admission/lookup-service';

export function useCommunityName(communityCategoryId: string | null | undefined): string | undefined {
  const { data } = useQuery({
    queryKey: ['lookup', 'community-categories', 'active'],
    queryFn: () => LookupService.listCommunityCategories(true),
    staleTime: 5 * 60 * 1000,
  });
  if (!communityCategoryId) return undefined;
  return data?.find((c) => c.id === communityCategoryId)?.code;
}
