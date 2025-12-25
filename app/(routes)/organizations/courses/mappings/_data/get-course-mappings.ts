/**
 * Server-side data fetching for Course Mappings List
 */



import { createClient } from '@/lib/supabase/server';

export interface CourseMappingsFilters {
  institutionId?: string;
  degreeId?: string;
  programId?: string;
  departmentId?: string;
  semesterId?: string;
  sectionId?: string;
  courseId?: string;
  page?: number;
  pageSize?: number;
}

export async function getCourseMappings(filters: CourseMappingsFilters = {}) {

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('course_mappings')
    .select(`
      *,
      course:courses(id, course_name, course_code),
      section:sections(id, section_name),
      semester:semesters(id, semester_name),
      program:programs(id, program_name),
      department:departments(id, department_name),
      degree:degrees(id, degree_name),
      institution:institutions(id, name)
    `, { count: 'exact' })
    .range(from, to)
    .order('created_at', { ascending: false });

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
  if (filters.sectionId) {
    query = query.eq('section_id', filters.sectionId);
  }
  if (filters.courseId) {
    query = query.eq('course_id', filters.courseId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getCourseMappings] Error:', error);
    throw new Error(`Failed to fetch course mappings: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
