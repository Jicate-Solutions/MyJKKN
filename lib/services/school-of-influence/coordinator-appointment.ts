// lib/services/school-of-influence/coordinator-appointment.ts
//
// "Am I an appointed School of Influence coordinator?" — the NAVIGATION half of
// the answer the route guard already knows.
//
// WHY THIS EXISTS
//   BUG-005799 / BUG-005800: a real, appointed programme coordinator
//   (cohort_coordinators, status 'active', programme_kind 'school_of_influence',
//   cohort_id NULL) could be authorised by the database for the review queue and
//   still not find it. Navigation asks one question — "does this user hold this
//   permission KEY?" — and an appointment is not a key. His role holds none of
//   cohort.manage, startup_studio.analytics.view or
//   startup_studio.school_of_influence.configure, so the sidebar, the chips and
//   Ctrl+K search all filtered School of Influence away from the one person
//   whose job it is.
//
//   The route guard had already solved the same problem the honest way:
//   app/(routes)/startup-studio/school-of-influence/layout.tsx passes a
//   fallbackCheck, so an appointment opens the page. This module is the matching
//   seam for the nav, exactly as hasAnyTournamentRole is for /events/tournament.
//
// WHY A TABLE READ AND NOT AN RPC
//   cohort_coordinators has RLS enabled and its SELECT policy is
//   `is_super_admin() OR user_id = auth.uid()`, with `authenticated` holding
//   SELECT and nothing else (documented in migration
//   20260816020001_programme_coordinator_authz.sql §0). A caller can therefore
//   read their OWN appointments and no one else's — which is the whole question
//   — with no new SQL to deploy.
//
//   fn_soi_has_programme_access() would also have answered, but it answers a
//   WIDER question: member OR coordinator. Using it here would put School of
//   Influence in the sidebar of every learner admitted to a batch and land them
//   on an admin screen that refuses them. This read is deliberately the narrow
//   one: an APPOINTMENT, nothing else.
//
// IT GRANTS NOTHING. The verdict widens VISIBILITY only. Every screen it
// reveals is still authorised by the database when opened —
// fn_soi_can_review_applications / fn_soi_can_manage_batch re-check the caller
// and refuse with an explicit panel, and the programme's Settings screen keeps
// its own startup_studio.school_of_influence.configure gate, which an
// appointment does not satisfy.
//
// Fails CLOSED: any error resolves false, i.e. today's behaviour.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/** cohort_coordinators.programme_kind for School of Influence. */
const SOI_PROGRAMME_KIND = 'school_of_influence';

/**
 * True when this user holds an ACTIVE School of Influence coordinator
 * appointment — programme-wide (cohort_id NULL) or naming one batch.
 *
 * `user_id` is filtered explicitly rather than left to RLS: a super admin's
 * policy branch reads every row, and "somebody, somewhere is a coordinator" is
 * not the question being asked.
 */
export async function hasActiveSoiCoordinatorAppointment(
  userId: string
): Promise<boolean> {
  if (!userId) return false;
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('cohort_coordinators')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('programme_kind', SOI_PROGRAMME_KIND)
      .limit(1);
    if (error) {
      logger.error(
        'school-of-influence',
        'cohort_coordinators lookup failed',
        error
      );
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    logger.error(
      'school-of-influence',
      'Unexpected error in hasActiveSoiCoordinatorAppointment',
      error
    );
    return false;
  }
}
