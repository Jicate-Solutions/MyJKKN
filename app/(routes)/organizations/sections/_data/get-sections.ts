/**
 * Server-side data fetching for Sections List
 */



import { createClient } from '@/lib/supabase/server';



export interface SectionsFilters {
  institutionId?: string;
  degreeId?: string;
  programId?: string;
  departmentId?: string;
  semesterId?: string;
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getSections(filters: SectionsFilters = {}) { // 1 hour cache

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('sections')
    .select(`
      *,
      institution:institutions(id, name),
      program:programs(id, program_name),
      department:departments(id, department_name),
      semester:semesters(id, semester_name),
      degree:degrees(id, degree_name)
    `, { count: 'exact' })
    .range(from, to)
    .order('section_name', { ascending: true });

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.degreeId) {
    query = query.eq('degree_id', filters.degreeId);
  }
  if (filters.programId) {
    query = query.eq('program_id', filters.programId);
  }
  if (filters.departmentId) {
    query = query.eq('department_id', filters.departmentId);
  }
  if (filters.semesterId) {
    query = query.eq('semester_id', filters.semesterId);
  }
  if (filters.search) {
    query = query.ilike('section_name', `%${filters.search}%`);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getSections] Error:', error);
    throw new Error(`Failed to fetch sections: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
