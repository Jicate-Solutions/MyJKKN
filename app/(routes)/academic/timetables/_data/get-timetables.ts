/**
 * Server-side data fetching for Timetables List
 *
 * Cached server function for fetching timetables with filters.
 */



import { createClient } from '@/lib/supabase/server';


import type { Timetable } from '@/types/academics';

export interface TimetablesFilters {
  institutionId?: string;
  academicYearId?: string;
  degreeId?: string;
  programId?: string;
  departmentId?: string;
  semesterId?: string;
  sectionId?: string;
  isActive?: boolean;
  isTemplate?: boolean;
  timetableFormat?: 'section' | 'semester';
  page?: number;
  pageSize?: number;
}

export interface TimetablesResponse {
  data: Timetable[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Get timetables list with server-side caching
 *
 * Cache Strategy: COLD (1 hour TTL)
 * - Timetables are relatively static once created
 * - Structure changes infrequently
 * - 1 hour cache balances freshness with performance
 */
export async function getTimetables(
  filters: TimetablesFilters = {}
): Promise<TimetablesResponse> {
  // Apply cache profile for cold data (1 hour)

  // Add cache tags for invalidation

  if (filters.sectionId) {
  }

  const supabase = await createClient();

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('timetables')
    .select(
      `
      *,
      institution:institutions(id, name, counselling_code),
      academic_year:academic_years(id, academic_year_name),
      degree:degrees(id, degree_name),
      program:programs(id, program_name),
      department:departments(id, department_name),
      semesters:semesters(id, semester_name),
      sections:sections(id, section_name)
    `,
      { count: 'exact' }
    )
    .range(from, to)
    .order('created_at', { ascending: false });

  // Apply filters
  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.academicYearId) {
    query = query.eq('academic_year_id', filters.academicYearId);
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
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }
  if (filters.isTemplate !== undefined) {
    query = query.eq('is_template', filters.isTemplate);
  }
  if (filters.timetableFormat) {
    query = query.eq('timetable_type', filters.timetableFormat);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getTimetables] Error fetching timetables:', error);
    throw new Error(`Failed to fetch timetables: ${error.message}`);
  }

  return {
    data: (data as Timetable[]) || [],
    total: count || 0,
    page,
    pageSize
  };
}
