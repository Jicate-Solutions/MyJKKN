/**
 * Server-side data fetching for Courses List
 */



import { createClient } from '@/lib/supabase/server';



export interface CoursesFilters {
  institutionId?: string;
  departmentId?: string;
  search?: string;
  courseType?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getCourses(filters: CoursesFilters = {}) { // 1 hour cache

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('courses')
    .select(`
      *,
      institution:institutions(id, name),
      department:departments(id, department_name)
    `, { count: 'exact' })
    .range(from, to)
    .order('course_name', { ascending: true });

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.departmentId) {
    query = query.eq('department_id', filters.departmentId);
  }
  if (filters.courseType) {
    query = query.eq('course_type', filters.courseType);
  }
  if (filters.search) {
    query = query.or(`course_name.ilike.%${filters.search}%,course_code.ilike.%${filters.search}%`);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getCourses] Error:', error);
    throw new Error(`Failed to fetch courses: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
