'use client';

import { useState, useEffect } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * Checks if a user (by profile ID) has an active hostel allocation.
 * Used to conditionally show hostel-only features like gate passes.
 */
export function useIsHostelResident(profileId?: string | null): boolean {
  const [isResident, setIsResident] = useState(false);

  useEffect(() => {
    if (!profileId) {
      setIsResident(false);
      return;
    }

    const check = async () => {
      const supabase = createClientSupabaseClient();
      const { count } = await supabase
        .from('hostel_allocations')
        .select('id', { count: 'exact', head: true })
        .eq('learner_id', profileId)
        .eq('status', 'active');

      setIsResident((count || 0) > 0);
    };

    check();
  }, [profileId]);

  return isResident;
}
