/**
 * Server-side data fetching for Programs List
 */



import { createClient } from '@/lib/supabase/server';



export interface ProgramsFilters {
  institutionId?: string;
  departmentId?: string;
  degreeId?: string;
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getPrograms(filters: ProgramsFilters = {}) { // 1 hour cache

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('programs')
    .select(`
      *,
      institution:institutions(id, name),
      department:departments(id, department_name),
      degree:degrees(id, degree_name)
    `, { count: 'exact' })
    .range(from, to)
    .order('program_name', { ascending: true });

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.departmentId) {
    query = query.eq('department_id', filters.departmentId);
  }
  if (filters.degreeId) {
    query = query.eq('degree_id', filters.degreeId);
  }
  if (filters.search) {
    query = query.or(`program_name.ilike.%${filters.search}%,program_code.ilike.%${filters.search}%`);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getPrograms] Error:', error);
    throw new Error(`Failed to fetch programs: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
