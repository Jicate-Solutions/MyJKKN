/**
 * POST /api/rcltp/assessments/:id/recording
 * RCLTP v2 Phase 3 — student uploads Part A audio → creates a rcltp_part_a_recordings
 * row (deterministic). The audio FILE upload to Storage is a separate client/infra
 * concern (rcltp-audio bucket is a deferred follow-up); this route persists the row
 * with the provided Storage path. Engine scoring is a separate gated route.
 * Gate: rcltp.assessment.take. Ownership: parent assessment must belong to the
 * session learner in the session institution.
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  notFoundResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import { rcltpAdminClient, readJson, resolveLearnerId } from '@/app/api/rcltp/_lib/route-helpers';

interface RecordingBody {
  audio_path?: string;
}

export const POST = withAuth(
  async (request, auth, context) => {
    const params = await context?.params;
    const assessmentId = params?.id;
    if (!assessmentId) return errorResponse('Assessment id is required', 400);

    const learnerId = await resolveLearnerId(auth);
    if (!learnerId) return forbiddenResponse('No learner profile is linked to this account');
    if (!auth.user.institution_id) {
      return forbiddenResponse('No institution context for this account');
    }

    const body = await readJson<RecordingBody>(request);
    const admin = rcltpAdminClient();

    // OWNERSHIP via parent assessment.
    const { data: a, error: fErr } = await admin
      .from('rcltp_assessments')
      .select('id, learner_id, institution_id, status')
      .eq('id', assessmentId)
      .maybeSingle();
    if (fErr) return handleSupabaseError(fErr);
    if (!a) return notFoundResponse('Assessment');
    if (a.learner_id !== learnerId || a.institution_id !== auth.user.institution_id) {
      return forbiddenResponse('This assessment does not belong to you');
    }

    // STATE GUARD — a recording may only be added while the sitting is open (mirror submit).
    if (!['scheduled', 'not_attempted', 'in_progress', 'recorded'].includes(a.status)) {
      return errorResponse(`Cannot add a recording to an assessment in status "${a.status}"`, 409);
    }

    const audioPath = typeof body.audio_path === 'string' ? body.audio_path : null;
    // Defense in depth: an audio_path must live under THIS learner's own folder.
    // The upload-url route mints paths as `institution/learner/assessment/...`, so
    // this prevents a student attaching another learner's recording to their row.
    if (audioPath && !audioPath.startsWith(`${auth.user.institution_id}/${learnerId}/`)) {
      return forbiddenResponse('audio_path is outside your scope');
    }
    const now = new Date().toISOString();

    const { data: rec, error: rErr } = await admin
      .from('rcltp_part_a_recordings')
      .insert({
        assessment_id: assessmentId,
        institution_id: auth.user.institution_id,
        audio_path: audioPath,
        // Derived, not body-trusted: a path means it's uploaded; otherwise local.
        sync_status: audioPath ? 'uploaded' : 'local',
        // scoring_status defaults to 'pending' (engine scoring is a gated route).
      })
      .select()
      .single();
    if (rErr) return handleSupabaseError(rErr);

    // Advance the sitting to 'recorded' if it was still open (deterministic).
    if (['scheduled', 'not_attempted', 'in_progress'].includes(a.status)) {
      await admin
        .from('rcltp_assessments')
        .update({ status: 'recorded', updated_at: now })
        .eq('id', assessmentId)
        .eq('learner_id', learnerId)
        .eq('institution_id', auth.user.institution_id);
    }

    return successResponse(rec);
  },
  { requirePermission: 'rcltp.assessment.take', allowApiKey: false }
);
