// lib/services/school-of-influence/access-gate.ts
// Client-side check backing RoutePermissionGuard's fallbackCheck for the
// /startup-studio/school-of-influence subtree (spec §7 S8, decision 6).
//
// WHY A FALLBACK AND NOT A PERMISSION KEY
//   Decision 6 says MEMBERSHIP gates the programme, not a role. A learner
//   admitted to a batch holds no startup_studio.* or cohort.* permission key, so
//   the static permission check denies them — /startup-studio/school-of-influence
//   inherits '/startup-studio' -> 'startup_studio.analytics.view' from
//   MENU_PERMISSIONS (routeMatcher.matchPermission keeps the deepest ancestor
//   match). That inherited key is what lets STAFF in; this fallback is what lets
//   MEMBERS in. Exactly the extension point RoutePermissionGuard documents, and
//   the same shape as the tournament in-charge and induction coordinator gates.
//
// The gate is PROGRAMME-wide, not batch-wide: batches are parallel groups of one
// programme (decision 1), so a member of any batch may open the programme pages.
// No argument is passed, i.e. "any School of Influence programme" — this call
// decides MODULE ENTRY only. Per-batch data is still filtered by RLS
// (cohorts_soi_member_select / cohort_memberships_soi_member_select), so entering
// the module leaks nothing: a Batch A member who is admitted here still reads
// only Batch A's roster, and only while soi.roster.visible_to_batchmates allows it.
//
// Fails CLOSED: any error resolves false, and the guard then renders
// PermissionError — an explicit "you do not have permission" surface, never a
// silent redirect (CLAUDE.md rule 27).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export async function hasSchoolOfInfluenceAccess(): Promise<boolean> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_soi_has_programme_access');
    if (error) {
      logger.error('school-of-influence', 'fn_soi_has_programme_access failed', error);
      return false;
    }
    return data === true;
  } catch (error) {
    logger.error('school-of-influence', 'Unexpected error in hasSchoolOfInfluenceAccess', error);
    return false;
  }
}
