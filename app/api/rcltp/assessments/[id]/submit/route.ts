/**
 * POST /api/rcltp/assessments/:id/submit
 * RCLTP v2 Phase 3 — student submits a sitting → queued_for_scoring.
 * NOTE: rcltp_assessment_status has NO "submitted" value; the deterministic
 * transition lands on 'queued_for_scoring' (+ submitted_at). The MyJKKN-gated
 * scoring step later moves it to 'scored'/'needs_review'.
 * Gate: rcltp.assessment.take. Ownership: session learner + session institution.
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
import { rcltpAdminClient, resolveLearnerId } from '@/app/api/rcltp/_lib/route-helpers';

export const POST = withAuth(
  async (_request, auth, context) => {
    const params = await context?.params;
    const assessmentId = params?.id;
    if (!assessmentId) return errorResponse('Assessment id is required', 400);

    const learnerId = await resolveLearnerId(auth);
    if (!learnerId) return forbiddenResponse('No learner profile is linked to this account');
    if (!auth.user.institution_id) {
      return forbiddenResponse('No institution context for this account');
    }

    const admin = rcltpAdminClient();
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

    // STATE GUARD — can only submit a sitting that is open or has a recording.
    if (!['in_progress', 'recorded'].includes(a.status)) {
      return errorResponse(`Cannot submit an assessment in status "${a.status}"`, 409);
    }

    const now = new Date().toISOString();
    const { data: updated, error: uErr } = await admin
      .from('rcltp_assessments')
      .update({ status: 'queued_for_scoring', submitted_at: now, updated_at: now })
      .eq('id', assessmentId)
      .eq('learner_id', learnerId)
      .eq('institution_id', auth.user.institution_id)
      .select()
      .single();
    if (uErr) return handleSupabaseError(uErr);
    return successResponse(updated);
  },
  { requirePermission: 'rcltp.assessment.take', allowApiKey: false }
);
