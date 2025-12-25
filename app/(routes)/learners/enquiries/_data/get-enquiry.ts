/**
 * Server-side data fetching for Single Enquiry
 *
 * This is a cached server function that fetches a single enquiry by ID.
 * Used by detail and edit pages.
 */



import { createClient } from '@/lib/supabase/server';


import type { LearnerProfile } from '@/types/learner-profile';

/**
 * Get enquiry by ID with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Individual enquiry data can change moderately
 * - Cache tag allows targeted invalidation
 */
export async function getEnquiry(id: string): Promise<LearnerProfile | null> {
  // Apply cache profile for warm data (5 minutes)

  // Add cache tags for invalidation

  const supabase = await createClient();

  // Query with relations
  const { data, error } = await supabase
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
      created_by_user:profiles!learners_profiles_created_by_fkey(id, email, full_name),
      updated_by_user:profiles!learners_profiles_updated_by_fkey(id, email, full_name)
    `
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[getEnquiry] Error fetching enquiry:', error);
    throw new Error(`Failed to fetch enquiry: ${error.message}`);
  }

  return data as LearnerProfile | null;
}
