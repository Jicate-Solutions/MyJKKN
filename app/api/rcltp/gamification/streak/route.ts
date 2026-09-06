/**
 * POST /api/rcltp/gamification/streak
 * RCLTP v2 Phase 3 — update a learner's streak, SERVER-SIDE ONLY, via the SECURITY
 * DEFINER fn_rcltp_update_streak (service_role EXECUTE only). E2 integrity: gated
 * rcltp.assessment.manage (students don't hold it) AND the RPC is service-role only.
 * The RPC is anti-spoof: a same-day re-log is a no-op DB-side.
 *
 * MULTI-TENANT: the institution is derived from the AUTHORITATIVE learner record
 * (learners_profiles), NOT the request body — no cross-tenant streak writes.
 *
 * Body: { learner_id, streak_type, logged_date? (YYYY-MM-DD) }
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  notFoundResponse,
} from '@/lib/api/response';
import {
  rcltpAdminClient,
  readJson,
  actorMayActOnInstitution,
  resolveLearnerInstitution,
} from '@/app/api/rcltp/_lib/route-helpers';

interface StreakBody {
  learner_id?: string;
  streak_type?: string;
  logged_date?: string;
}

export const POST = withAuth(
  async (request, auth) => {
    const body = await readJson<StreakBody>(request);
    if (!body.learner_id || !body.streak_type) {
      return errorResponse('learner_id and streak_type are required', 400);
    }

    const admin = rcltpAdminClient();

    const institutionId = await resolveLearnerInstitution(admin, body.learner_id);
    if (!institutionId) return notFoundResponse('Learner (or learner institution)');

    if (!(await actorMayActOnInstitution(auth, institutionId))) {
      return forbiddenResponse('You may not update streaks for this learner');
    }

    const args: Record<string, unknown> = {
      p_learner_id: body.learner_id,
      p_institution_id: institutionId,
      p_streak_type: body.streak_type,
    };
    // Omit p_logged_date to let the RPC default to current_date.
    if (body.logged_date) args.p_logged_date = body.logged_date;

    const { error } = await admin.rpc('fn_rcltp_update_streak', args);
    if (error) {
      return errorResponse(error.message || 'Streak update failed', 400, 'STREAK_FAILED');
    }
    return successResponse({ updated: true });
  },
  { requirePermission: 'rcltp.assessment.manage', allowApiKey: false }
);
