/**
 * Server-side data fetching for Departments List
 */



import { createClient } from '@/lib/supabase/server';



export interface DepartmentsFilters {
  institutionId?: string;
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getDepartments(filters: DepartmentsFilters = {}) { // 1 hour cache

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('departments')
    .select('*, institution:institutions(id, name)', { count: 'exact' })
    .range(from, to)
    .order('department_name', { ascending: true });

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.search) {
    query = query.or(`department_name.ilike.%${filters.search}%,department_code.ilike.%${filters.search}%`);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getDepartments] Error:', error);
    throw new Error(`Failed to fetch departments: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
