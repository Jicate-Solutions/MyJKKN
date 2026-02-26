/**
 * Server-side data fetching for Single Learner Profile
 *
 * This is a cached server function that fetches a single learner profile by ID.
 * Used by detail and edit pages.
 */



import { createClient } from '@/lib/supabase/server';


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

  // No embedded joins — same reason as get-learner-profiles.ts:
  // 9 org-table FKs were dropped to allow JKKN sync upserts.
  // created_by_user / updated_by_user also removed for safety (FK state unknown).
  // LearnerProfile marks all joined objects optional so detail page handles null.
  const { data, error } = await supabase
    .from('learners_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[getLearnerProfile] Error fetching profile:', error);
    throw new Error(`Failed to fetch learner profile: ${error.message}`);
  }

  return data as LearnerProfile | null;
}
