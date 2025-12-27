/**
 * Server-side data fetching for Learner Profiles
 *
 * This is a cached server function that fetches learner profiles data.
 * Used by the server component to pre-render data on the server.
 */



import { createClient } from '@/lib/supabase/server';


import type { LearnerProfile, LifecycleStatus } from '@/types/learner-profile';

interface GetLearnerProfilesParams {
  page?: number;
  limit?: number;
  search?: string;
  lifecycle_status?: LifecycleStatus;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  gender?: string;
  is_profile_complete?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  learner_id?: string; // Added: Filter by specific learner ID (for students viewing own profile)
}

interface GetLearnerProfilesResult {
  data: LearnerProfile[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

/**
 * Get learner profiles with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Student data changes moderately (several times per hour)
 * - Balance between freshness and performance
 * - Cache tags allow targeted invalidation when profiles are created/updated/deleted
 */
export async function getLearnerProfiles(
  params: GetLearnerProfilesParams = {}
): Promise<GetLearnerProfilesResult> {
  // Apply cache profile for warm data (5 minutes)

  // Add cache tags for invalidation
  if (params.lifecycle_status) {
  }
  if (params.section_id) {
  }
  if (params.institution_id) {
  }

  const supabase = await createClient();

  const {
    page = 1,
    limit = 10,
    search,
    lifecycle_status,
    institution_id,
    degree_id,
    department_id,
    program_id,
    semester_id,
    section_id,
    academic_year_id,
    gender,
    is_profile_complete,
    sortBy = 'created_at',
    sortOrder = 'desc',
    learner_id // Added: For student self-view filtering
  } = params;

  // Build query with relations
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
      academic_year:academic_years(id, academic_year_name, start_date, end_date, is_active),
      regulation:regulations(id, regulation_code, regulation_year),
      batch:batches(id, batch_name, batch_code)
    `,
      { count: 'exact' }
    );

  // Apply filters
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,application_id.ilike.%${search}%,roll_number.ilike.%${search}%,college_email.ilike.%${search}%`
    );
  }

  if (lifecycle_status) {
    query = query.eq('lifecycle_status', lifecycle_status);
  }

  if (institution_id) {
    query = query.eq('institution_id', institution_id);
  }

  // Student self-view filter (highest priority - students can only see own profile)
  if (learner_id) {
    query = query.eq('id', learner_id);
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

  if (semester_id) {
    query = query.eq('semester_id', semester_id);
  }

  if (section_id) {
    query = query.eq('section_id', section_id);
  }

  if (academic_year_id) {
    query = query.eq('academic_year_id', academic_year_id);
  }

  if (gender) {
    query = query.eq('gender', gender);
  }

  if (is_profile_complete !== undefined) {
    query = query.eq('is_profile_complete', is_profile_complete);
  }

  // Apply sorting
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  // Apply pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Execute the main query
  const { data, error } = await query.range(from, to);

  if (error) {
    console.error('[getLearnerProfiles] Error fetching profiles:', error);
    throw new Error(`Failed to fetch learner profiles: ${error.message}`);
  }

  // Get accurate count with a separate simplified query
  let countQuery = supabase
    .from('learners_profiles')
    .select('*', { count: 'exact', head: true });

  // Apply the same filters as the main query
  if (search) {
    countQuery = countQuery.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,application_id.ilike.%${search}%,roll_number.ilike.%${search}%,college_email.ilike.%${search}%`
    );
  }
  if (lifecycle_status) {
    countQuery = countQuery.eq('lifecycle_status', lifecycle_status);
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
  if (semester_id) {
    countQuery = countQuery.eq('semester_id', semester_id);
  }
  if (section_id) {
    countQuery = countQuery.eq('section_id', section_id);
  }
  if (academic_year_id) {
    countQuery = countQuery.eq('academic_year_id', academic_year_id);
  }
  if (gender) {
    countQuery = countQuery.eq('gender', gender);
  }
  if (is_profile_complete !== undefined) {
    countQuery = countQuery.eq('is_profile_complete', is_profile_complete);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error('[getLearnerProfiles] Error fetching count:', countError);
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
