/**
 * Server-side data fetching for Alumni
 *
 * This is a cached server function that fetches alumni data.
 * Used by the server component to pre-render data on the server.
 */



import { createClient } from '@/lib/supabase/server';


import type { LearnerProfile } from '@/types/learner-profile';

interface GetAlumniParams {
  page?: number;
  limit?: number;
  search?: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  graduation_year?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface GetAlumniResult {
  data: LearnerProfile[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

/**
 * Get alumni with server-side caching
 *
 * Cache Strategy: COLD (1 hour TTL)
 * - Alumni data changes infrequently
 * - Cache tags allow targeted invalidation
 */
export async function getAlumni(
  params: GetAlumniParams = {}
): Promise<GetAlumniResult> {
  // Apply cache profile for cold data (1 hour) - alumni data is relatively static

  // Add cache tags for invalidation
  if (params.institution_id) {
  }

  const supabase = await createClient();

  const {
    page = 1,
    limit = 10,
    search,
    institution_id,
    degree_id,
    department_id,
    program_id,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = params;

  // Build query - filter for graduated and alumni statuses
  let query = supabase
    .from('learners_profiles')
    .select(
      `
      *,
      institution:institutions(id, name, counselling_code),
      degree:degrees(id, degree_name, degree_id),
      department:departments(id, department_name),
      program:programs(id, program_name),
      semester:semesters(id, semester_name, semester_code),
      section:sections(id, section_name),
      batch:batches(id, batch_name, batch_code)
    `,
      { count: 'exact' }
    )
    .in('lifecycle_status', ['graduated', 'alumni']);

  // Apply filters
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,roll_number.ilike.%${search}%,college_email.ilike.%${search}%,register_number.ilike.%${search}%`
    );
  }

  if (institution_id) {
    query = query.eq('institution_id', institution_id);
  }

  if (degree_id) {
    query = query.eq('degree_id', degree_id);
  }

  if (department_id) {
    query = query.eq('department_id', department_id);
  }

  if (program_id) {
    query = query.eq('program_id', program_id);
  }

  // Apply sorting
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  // Apply pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Execute the main query
  const { data, error } = await query.range(from, to);

  if (error) {
    console.error('[getAlumni] Error fetching alumni:', error);
    throw new Error(`Failed to fetch alumni: ${error.message}`);
  }

  // Get accurate count with a separate simplified query
  let countQuery = supabase
    .from('learners_profiles')
    .select('*', { count: 'exact', head: true })
    .in('lifecycle_status', ['graduated', 'alumni']);

  // Apply the same filters as the main query
  if (search) {
    countQuery = countQuery.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,roll_number.ilike.%${search}%,college_email.ilike.%${search}%,register_number.ilike.%${search}%`
    );
  }

  if (institution_id) {
    countQuery = countQuery.eq('institution_id', institution_id);
  }

  if (degree_id) {
    countQuery = countQuery.eq('degree_id', degree_id);
  }

  if (department_id) {
    countQuery = countQuery.eq('department_id', department_id);
  }

  if (program_id) {
    countQuery = countQuery.eq('program_id', program_id);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error('[getAlumni] Error fetching count:', countError);
  }

  const totalPages = count ? Math.ceil(count / limit) : 0;

  return {
    data: (data as LearnerProfile[]) || [],
    metadata: {
      total_items: count || 0,
      page,
      limit,
      total_pages: totalPages
    }
  };
}
