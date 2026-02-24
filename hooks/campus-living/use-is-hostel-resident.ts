'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * Checks if a user (by profile ID) has an active hostel allocation.
 * Used to conditionally show hostel-only features like gate passes.
 */
export function useIsHostelResident(profileId?: string | null): boolean {
  const { data: isResident = false } = useQuery({
    queryKey: ['hostel-resident-check', profileId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { count } = await (supabase as any)
        .from('hostel_allocations')
        .select('id', { count: 'exact', head: true })
        .eq('learner_id', profileId)
        .eq('status', 'active');

      return (count || 0) > 0;
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes — allocation status rarely changes
  });

  return isResident;
}
