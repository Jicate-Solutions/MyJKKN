/**
 * Server-side data fetching for Single Learner Profile
 *
 * This is a cached server function that fetches a single learner profile by ID.
 * Used by detail and edit pages.
 */



import { createClient } from '@/lib/supabase/server';

import { accommodationLegacyFromCode } from '@/lib/utils/accommodation-type-resolver';

import type { LearnerProfile } from '@/types/learner-profile';

/**
 * Get learner profile by ID with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Individual profile data can change moderately
 * - Cache tag allows targeted invalidation when this specific profile is updated
 */
export async function getLearnerProfile(id: string): Promise<LearnerProfile | null> {
  // Apply cache profile for warm data (5 minutes)

  // Add cache tags for invalidation

  const supabase = await createClient();

  // Query with all relations
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
      academic_year:academic_years(id, academic_year_name, start_date, end_date, is_active),
      regulation:regulations(id, regulation_code, regulation_year),
      batch:batches(id, batch_name, batch_code),
      accommodation_ref:accommodation_types!accommodation_type_id(code, name),
      created_by_user:profiles!learners_profiles_created_by_fkey(id, email, full_name),
      updated_by_user:profiles!learners_profiles_updated_by_fkey(id, email, full_name),
      admission_year_obj:admission_years!admission_year_id(id, admission_year_name, year)
    `
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[getLearnerProfile] Error fetching profile:', error);
    throw new Error(`Failed to fetch learner profile: ${error.message}`);
  }

  // accommodation_type TEXT column is retired — derive the legacy 'HOSTEL'/
  // 'DAY SCHOLAR' value from the FK so display + conditional checks keep
  // working off learner.accommodation_type. Mirrors the shim in
  // LearnerProfileService.getLearnerProfile(); without it the detail page
  // rendered "Not specified" and hid every hostel/day-scholar sub-field.
  const row = data as Record<string, unknown> | null;
  if (row) {
    row.accommodation_type = accommodationLegacyFromCode(
      (row.accommodation_ref as { code?: string } | null)?.code,
    );
    delete row.accommodation_ref;
  }

  return row as LearnerProfile | null;
}
