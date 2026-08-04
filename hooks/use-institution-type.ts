import { useQuery } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export type InstitutionType = 'school' | 'institution' | 'admin_office' | 'company';

/**
 * Fetches the entity_type of the current user's institution
 * Returns 'school' for K-12 schools, 'institution' for colleges, etc.
 */
export function useInstitutionType() {
  const { profile } = useAuth();

  const { data: institutionType = 'institution', isLoading, error } = useQuery<InstitutionType>({
    queryKey: ['institutionType', profile?.institution_id],
    enabled: !!profile?.institution_id,
    // An institution's entity_type effectively never changes — 15 min
    // freshness so navbar + sidebar + bottom-nav consumers share one fetch
    // instead of refetching on every stale remount (2026-08-02 shell dedupe).
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      if (!profile?.institution_id) {
        return 'institution';
      }

      try {
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('institutions')
          .select('entity_type')
          .eq('id', profile.institution_id)
          .single();

        if (error || !data) {
          console.error('Failed to fetch institution type:', error);
          return 'institution';
        }

        return (data.entity_type as InstitutionType) || 'institution';
      } catch (err) {
        console.error('Error fetching institution type:', err);
        return 'institution';
      }
    }
  });

  return { institutionType, isLoading, error };
}
