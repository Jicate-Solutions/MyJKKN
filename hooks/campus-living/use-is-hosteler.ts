'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * True when the current user is a hostel resident (learners_profiles
 * accommodation type = hostel). Mirrors the SQL gate user_is_hosteler();
 * we call the RPC so the client and RLS agree on one definition.
 */
export function useIsHosteler(enabled = true) {
  return useQuery({
    queryKey: ['campus-living', 'is-hosteler'],
    queryFn: async (): Promise<boolean> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('user_is_hosteler');
      if (error) throw error;
      return data === true;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
