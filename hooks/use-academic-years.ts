import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

const supabase = createClientSupabaseClient();

export function useAcademicYears(institutionId?: string) {
  return useQuery({
    queryKey: ['academic-years', institutionId],
    queryFn: async () => {
      let query = supabase
        .from('academic_years')
        .select('*')
        .eq('is_active', true)
        .order('academic_year_name', { ascending: false });

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[use-academic-years] Error fetching academic years:', error);
        throw error;
      }

      return { data: data || [], total: data?.length || 0 };
    },
  });
}
