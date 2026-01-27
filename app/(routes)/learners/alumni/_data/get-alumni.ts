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

  // Apply filters - Parse advanced search format
  if (search) {
    // Check if this is the new advanced search format: "name:John|roll:123|email:test@example.com"
    if (search.includes('|') || search.includes(':')) {
      // Parse the search format
      const searchParts = search.split('|');
      const searchConditions: string[] = [];

      searchParts.forEach(part => {
        const [field, value] = part.split(':');
        if (!field || !value) return;

        const trimmedValue = value.trim();
        if (!trimmedValue) return;

        // Map field names to database columns
        if (field === 'name') {
          // Search in both first_name and last_name
          searchConditions.push(`first_name.ilike.%${trimmedValue}%`);
          searchConditions.push(`last_name.ilike.%${trimmedValue}%`);
        } else if (field === 'roll') {
          searchConditions.push(`roll_number.ilike.%${trimmedValue}%`);
          searchConditions.push(`register_number.ilike.%${trimmedValue}%`); // Also search register_number for alumni
        } else if (field === 'email') {
          searchConditions.push(`student_email.ilike.%${trimmedValue}%`);
          searchConditions.push(`college_email.ilike.%${trimmedValue}%`);
        }
      });

      // Apply the OR conditions if we have any
      if (searchConditions.length > 0) {
        query = query.or(searchConditions.join(','));
      }
    } else {
      // Fallback to old search format (search all fields)
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,roll_number.ilike.%${search}%,college_email.ilike.%${search}%,register_number.ilike.%${search}%`
      );
    }
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

  // Handle pagination range error gracefully
  // PGRST103: "Requested range not satisfiable" - happens when offset > total rows
  if (error) {
    if (error.code === 'PGRST103') {
      // Range not satisfiable - return empty data instead of throwing
      console.warn('[getAlumni] Pagination range exceeds available rows, returning empty result');
    } else {
      // Other errors should still throw
      console.error('[getAlumni] Error fetching alumni:', error);
      throw new Error(`Failed to fetch alumni: ${error.message}`);
    }
  }

  // Get accurate count with a separate simplified query
  let countQuery = supabase
    .from('learners_profiles')
    .select('*', { count: 'exact', head: true })
    .in('lifecycle_status', ['graduated', 'alumni']);

  // Apply the same filters as the main query
  if (search) {
    // Check if this is the new advanced search format
    if (search.includes('|') || search.includes(':')) {
      // Parse the search format
      const searchParts = search.split('|');
      const searchConditions: string[] = [];

      searchParts.forEach(part => {
        const [field, value] = part.split(':');
        if (!field || !value) return;

        const trimmedValue = value.trim();
        if (!trimmedValue) return;

        // Map field names to database columns
        if (field === 'name') {
          searchConditions.push(`first_name.ilike.%${trimmedValue}%`);
          searchConditions.push(`last_name.ilike.%${trimmedValue}%`);
        } else if (field === 'roll') {
          searchConditions.push(`roll_number.ilike.%${trimmedValue}%`);
          searchConditions.push(`register_number.ilike.%${trimmedValue}%`);
        } else if (field === 'email') {
          searchConditions.push(`student_email.ilike.%${trimmedValue}%`);
          searchConditions.push(`college_email.ilike.%${trimmedValue}%`);
        }
      });

      // Apply the OR conditions if we have any
      if (searchConditions.length > 0) {
        countQuery = countQuery.or(searchConditions.join(','));
      }
    } else {
      // Fallback to old search format
      countQuery = countQuery.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,roll_number.ilike.%${search}%,college_email.ilike.%${search}%,register_number.ilike.%${search}%`
      );
    }
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
