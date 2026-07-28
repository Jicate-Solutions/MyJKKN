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

/**
 * The academic year that actually contains today, for one institution.
 *
 * Never sort by academic_year_name — it is TEXT, so '2030-2031' > '2026-2027',
 * and several rows carry trailing spaces ('2026-2027 '). Institutions
 * pre-create future years with is_active=true, so a name-desc [0] pick
 * silently resolves years up to five years out.
 *
 * Falls back to the most recently STARTED active year when today sits in a
 * gap between configured years.
 */
export function useCurrentAcademicYear(institutionId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['academic-year-current', institutionId],
    enabled: !!institutionId,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      const { data: bracketing, error: bracketErr } = await supabase
        .from('academic_years')
        .select('*')
        .eq('is_active', true)
        .eq('institution_id', institutionId!)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('start_date', { ascending: false })
        .limit(1);
      if (bracketErr) throw bracketErr;
      if (bracketing && bracketing.length > 0) return bracketing[0];

      const { data: fallback, error: fallbackErr } = await supabase
        .from('academic_years')
        .select('*')
        .eq('is_active', true)
        .eq('institution_id', institutionId!)
        .lte('start_date', today)
        .order('start_date', { ascending: false })
        .limit(1);
      if (fallbackErr) throw fallbackErr;
      return fallback?.[0] ?? null;
    },
  });
}
