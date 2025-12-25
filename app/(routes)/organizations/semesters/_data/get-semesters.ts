/**
 * Server-side data fetching for Semesters List
 */



import { createClient } from '@/lib/supabase/server';



export interface SemestersFilters {
  institutionId?: string;
  degreeId?: string;
  programId?: string;
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getSemesters(filters: SemestersFilters = {}) { // 1 hour cache

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('semesters')
    .select(`
      *,
      institution:institutions(id, name),
      program:programs(id, program_name),
      degree:degrees(id, degree_name)
    `, { count: 'exact' })
    .range(from, to)
    .order('semester_number', { ascending: true });

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.degreeId) {
    query = query.eq('degree_id', filters.degreeId);
  }
  if (filters.programId) {
    query = query.eq('program_id', filters.programId);
  }
  if (filters.search) {
    query = query.ilike('semester_name', `%${filters.search}%`);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getSemesters] Error:', error);
    throw new Error(`Failed to fetch semesters: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
