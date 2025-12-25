/**
 * Server-side data fetching for Academic Years List
 */



import { createClient } from '@/lib/supabase/server';



export interface AcademicYearsFilters {
  institutionId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getAcademicYears(filters: AcademicYearsFilters = {}) {

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('academic_years')
    .select('*, institution:institutions(id, name)', { count: 'exact' })
    .range(from, to)
    .order('start_date', { ascending: false });

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getAcademicYears] Error:', error);
    throw new Error(`Failed to fetch academic years: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
