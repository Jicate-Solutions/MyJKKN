'use server';

// app/(routes)/learners/profiles/[id]/_actions/record-360-intervention.ts
// ============================================================================
// Server action: a mentor/counselor records the action they took on a learner's
// 360 standing verdict — the ACT leg of the learner-360 return edge.
//
// v1 is deliberately action-only (no UI mount): the profile page's 360 standing
// section renders the risk/contribution/attendance numbers but does not yet
// display the learner_360_verdicts narrative itself, so there is no verdict
// surface to hang an "action taken" affordance on. When the verdict narrative
// ships on the profile page, that surface calls this action.
//
// Client discipline (house rule, see okay-narrative.ts): the SESSION client
// (cookie-bound) calls the SECDEF RPC so auth.uid() is the acting user and the
// in-body permission check (learners.standing.intervene, or admin, scoped to
// the verdict's institution) resolves against the real caller. No service-role
// client anywhere in this path.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import {
  recordLearner360Intervention,
  type RecordInterventionResult,
} from '@/lib/services/learner-360/intervention-service';

export async function record360Intervention(
  verdictId: string,
  actionTaken: string,
): Promise<RecordInterventionResult> {
  const session = await createClient();
  return recordLearner360Intervention(session, { verdictId, actionTaken });
}
