/**
 * Server-side data fetching for Staff Planning List
 */



import { createClient } from '@/lib/supabase/server';



export interface StaffPlansFilters {
  institutionId?: string;
  degreeId?: string;
  programId?: string;
  departmentId?: string;
  semesterId?: string;
  academicYearId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getStaffPlans(filters: StaffPlansFilters = {}) { // 1 hour cache for staff planning data

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('staff_plans')
    .select(`
      *,
      institution:institutions(id, name),
      degree:degrees(id, degree_name),
      program:programs(id, program_name),
      department:departments(id, department_name),
      semester:semesters(id, semester_name),
      academic_year:academic_years(id, academic_year_name)
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
  if (filters.academicYearId) {
    query = query.eq('academic_year_id', filters.academicYearId);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getStaffPlans] Error:', error);
    throw new Error(`Failed to fetch staff plans: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
