/**
 * Server-side data fetching for Regulations List
 */



import { createClient } from '@/lib/supabase/server';



export interface RegulationsFilters {
  institutionId?: string;
  degreeId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getRegulations(filters: RegulationsFilters = {}) {

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('regulations')
    .select('*, institution:institutions(id, name), degree:degrees(id, degree_name)', { count: 'exact' })
    .range(from, to)
    .order('regulation_year', { ascending: false });

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.degreeId) {
    query = query.eq('degree_id', filters.degreeId);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getRegulations] Error:', error);
    throw new Error(`Failed to fetch regulations: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
