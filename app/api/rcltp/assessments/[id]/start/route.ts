/**
 * POST /api/rcltp/assessments/:id/start
 * RCLTP v2 Phase 3 — student opens a scheduled sitting (deterministic state move).
 * Gate: rcltp.assessment.take (students hold it). Ownership: the sitting must
 * belong to the SESSION learner (get_my_learner_id) in the session institution.
 * Students are READ-ONLY in RLS — the write runs service-role, re-scoped manually.
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
      .select('id, learner_id, institution_id, status, opened_at')
      .eq('id', assessmentId)
      .maybeSingle();
    if (fErr) return handleSupabaseError(fErr);
    if (!a) return notFoundResponse('Assessment');

    // OWNERSHIP — the sitting must belong to THIS learner in THIS institution.
    if (a.learner_id !== learnerId || a.institution_id !== auth.user.institution_id) {
      return forbiddenResponse('This assessment does not belong to you');
    }

    // STATE GUARD — only a not-yet-started sitting can be started (in_progress = idempotent).
    if (!['scheduled', 'not_attempted', 'in_progress'].includes(a.status)) {
      return errorResponse(`Cannot start an assessment in status "${a.status}"`, 409);
    }

    const now = new Date().toISOString();
    const { data: updated, error: uErr } = await admin
      .from('rcltp_assessments')
      .update({ status: 'in_progress', opened_at: a.opened_at ?? now, updated_at: now })
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
