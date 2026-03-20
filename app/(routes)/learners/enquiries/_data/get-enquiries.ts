/**
 * Server-side data fetching for Enquiries
 *
 * This is a cached server function that fetches enquiry data.
 * Used by the server component to pre-render data on the server.
 */



import { createClient } from '@/lib/supabase/server';


import type { LearnerProfile } from '@/types/learner-profile';

interface GetEnquiriesParams {
  page?: number;
  limit?: number;
  search?: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  lifecycle_status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface GetEnquiriesResult {
  data: LearnerProfile[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

/**
 * Get enquiries with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Enquiry data changes moderately
 * - Cache tags allow targeted invalidation
 */
export async function getEnquiries(
  params: GetEnquiriesParams = {}
): Promise<GetEnquiriesResult> {
  // Apply cache profile for warm data (5 minutes)

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
    lifecycle_status,
    sortBy = 'first_name',
    sortOrder = 'asc'
  } = params;

  // Build query - filter for enquiry and pending statuses
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
      section:sections(id, section_name)
    `,
      { count: 'exact' }
    );

  // Filter for enquiry statuses
  if (lifecycle_status) {
    query = query.eq('lifecycle_status', lifecycle_status);
  } else {
    query = query.in('lifecycle_status', ['enquiry', 'pending']);
  }

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
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,application_id.ilike.%${search}%,student_email.ilike.%${search}%,student_mobile.ilike.%${search}%`
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
      console.warn('[getEnquiries] Pagination range exceeds available rows, returning empty result');
    } else {
      // Other errors should still throw
      console.error('[getEnquiries] Error fetching enquiries:', error);
      throw new Error(`Failed to fetch enquiries: ${error.message}`);
    }
  }

  // Get accurate count with a separate simplified query
  let countQuery = supabase
    .from('learners_profiles')
    .select('*', { count: 'exact', head: true });

  // Apply the same filters as the main query
  if (lifecycle_status) {
    countQuery = countQuery.eq('lifecycle_status', lifecycle_status);
  } else {
    countQuery = countQuery.in('lifecycle_status', ['enquiry', 'pending']);
  }

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
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,application_id.ilike.%${search}%,student_email.ilike.%${search}%,student_mobile.ilike.%${search}%`
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

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error('[getEnquiries] Error fetching count:', countError);
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
