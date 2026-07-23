/**
 * POST /api/rcltp/vbb/progress
 * RCLTP v2 Phase 3 — record the session learner's VBB (vocabulary) progress for
 * a stage/week (deterministic persist of the provided values). The score MAY
 * later feed band progression — but that progression logic is MyJKKN-gated and
 * lives in results/journey, not here. This route only stores what is reported.
 * Gate: rcltp.assessment.take. Learner from session (get_my_learner_id), never body.
 * Body: { stage?, score?, completion_rate?, week_of? (YYYY-MM-DD) }
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  forbiddenResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import { rcltpAdminClient, readJson, resolveLearnerId } from '@/app/api/rcltp/_lib/route-helpers';

interface VbbProgressBody {
  stage?: string;
  score?: number;
  completion_rate?: number;
  week_of?: string;
}

export const POST = withAuth(
  async (request, auth) => {
    const learnerId = await resolveLearnerId(auth);
    if (!learnerId) return forbiddenResponse('No learner profile is linked to this account');
    const institutionId = auth.user.institution_id;
    if (!institutionId) return forbiddenResponse('No institution context for this account');

    const body = await readJson<VbbProgressBody>(request);
    const admin = rcltpAdminClient();

    const { data, error } = await admin
      .from('rcltp_vbb_progress')
      .insert({
        learner_id: learnerId,
        institution_id: institutionId,
        stage: body.stage ?? null,
        score: typeof body.score === 'number' ? body.score : null,
        completion_rate: typeof body.completion_rate === 'number' ? body.completion_rate : null,
        week_of: body.week_of ?? null,
      })
      .select()
      .single();
    if (error) return handleSupabaseError(error);
    return successResponse(data);
  },
  { requirePermission: 'rcltp.assessment.take', allowApiKey: false }
);
