/**
 * POST /api/rcltp/recordings/:id/score
 * RCLTP v2 Phase 3 (GROUP B — MyJKKN-content-gated body).
 * The route + auth + ownership + service-role wiring are LIVE. The actual
 * voice-scoring engine call + the composite-score formula (accuracy/fluency/
 * pron/wpm → reading score, the 67→85 example) are MyJKKN content — DEFERRED, so
 * nothing fabricates a score. Returns an honest "awaiting MyJKKN content" 501.
 *
 * Gate: rcltp.review (reviewers/teachers/admins). Institution-scoped to the recording.
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/auth/with-auth';
import {
  errorResponse,
  forbiddenResponse,
  notFoundResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import {
  rcltpAdminClient,
  actorMayActOnInstitution,
  pendingValidationResponse,
} from '@/app/api/rcltp/_lib/route-helpers';

export const POST = withAuth(
  async (_request, auth, context) => {
    const params = await context?.params;
    const recordingId = params?.id;
    if (!recordingId) return errorResponse('Recording id is required', 400);

    const admin = rcltpAdminClient();
    const { data: rec, error: fErr } = await admin
      .from('rcltp_part_a_recordings')
      .select('id, institution_id, assessment_id, scoring_status')
      .eq('id', recordingId)
      .maybeSingle();
    if (fErr) return handleSupabaseError(fErr);
    if (!rec) return notFoundResponse('Recording');

    // Multi-tenant guard before doing anything content-side.
    if (!(await actorMayActOnInstitution(auth, rec.institution_id))) {
      return forbiddenResponse('You may not score recordings in this institution');
    }

    // MyJKKN-gated: do NOT invent the scoring engine call or the composite formula.
    return pendingValidationResponse('voice scoring engine + composite-score formula', {
      recording_id: rec.id,
      scoring_status: rec.scoring_status,
    });
  },
  { requirePermission: 'rcltp.review', allowApiKey: false }
);
