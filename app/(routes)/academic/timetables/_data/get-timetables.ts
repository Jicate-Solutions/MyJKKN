/**
 * Server-side data fetching for Timetables List
 *
 * Cached server function for fetching timetables with filters.
 */

/**
 * SERVER-SIDE DATA FETCHER — runs in React Server Components using server Supabase client.
 * Client-side mirror: {@link TimetableService#getTimetables} in lib/services/academic/timetable-service.ts
 *
 * NOTE: The service mirror uses FK-alias join syntax (e.g. `institution:institution_id(id, name)`)
 * while this fetcher uses table-name alias syntax (e.g. `institution:institutions(id, name)`).
 * Both resolve to the same data in PostgREST — keep select fields in sync.
 *
 * Do not replace with service call — server vs client Supabase boundary.
 * Keep query shapes in sync when modifying either side.
 */

import { createClient } from '@/lib/supabase/server';
import { cache } from 'react';

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
 * Get timetables list — deduplicated within each server request.
 *
 * WHY NOT 'use cache':
 * getTimetables calls createClient() which reads the auth cookie via next/headers.
 * Next.js 16 forbids dynamic request data (headers, auth tokens) inside 'use cache'
 * scopes because a shared cache could serve one user's session data to another user.
 * See: https://nextjs.org/docs/messages/next-request-in-use-cache
 *
 * DEDUPLICATION STRATEGY:
 * React's cache() deduplicates identical calls within the same server render pass.
 * If page.tsx calls getTimetables(filters) twice with the same args, Supabase is
 * only queried once. Cross-request caching is intentionally not used here since
 * the data is auth-scoped (institution_id filter comes from the user's profile).
 */
export const getTimetables = cache(async function getTimetables(
  filters: TimetablesFilters = {}
): Promise<TimetablesResponse> {
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
});
