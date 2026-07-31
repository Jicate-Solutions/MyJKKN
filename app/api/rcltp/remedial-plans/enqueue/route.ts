/**
 * POST /api/rcltp/remedial-plans/enqueue
 * RCLTP — a Senior Learner requests an AI-drafted remedial reading plan for one
 * at-risk learner. Writes a 'queued' placeholder + enqueues the generation on the
 * ₹0 Max lane (async); the collect cron writes the 'draft' row once the seat runs.
 *
 * Auth: rcltp.review (the review/approve capability) + institution access. The
 * service-role write bypasses RLS, so BOTH are re-asserted here before enqueuing.
 * Body: { learnerId }. English only (Nattraja CBSE).
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
  actorHasPermission,
  actorMayActOnInstitution,
  resolveLearnerInstitution,
  readJson,
} from '@/app/api/rcltp/_lib/route-helpers';
import { enqueueRemedialPlanDraft } from '@/lib/services/rcltp/remedial-plan-service';

export const POST = withAuth(async (request, auth) => {
  const body = await readJson<{ learnerId?: string }>(request);
  const learnerId = body.learnerId;
  if (!learnerId || typeof learnerId !== 'string') {
    return errorResponse('learnerId is required', 400);
  }

  // Capability gate — only a Senior Learner who can review RCLTP may request a
  // plan. Evaluated under the caller's own session (multi-role OR-merge applies).
  if (!(await actorHasPermission(auth, 'rcltp.review'))) {
    return forbiddenResponse(
      'You need the rcltp.review permission to request a remedial plan'
    );
  }

  const admin = rcltpAdminClient();

  // Multi-tenant boundary — derive the learner's institution from the learner
  // record, NEVER from the request body, then assert the actor may act on it.
  const institutionId = await resolveLearnerInstitution(admin, learnerId);
  if (!institutionId) return notFoundResponse('Learner');
  if (!(await actorMayActOnInstitution(auth, institutionId))) {
    return forbiddenResponse(
      'You may not request remedial plans for learners in this institution'
    );
  }

  const result = await enqueueRemedialPlanDraft(admin, learnerId);
  if (!result.ok) {
    if (result.reason === 'not_at_risk') {
      return errorResponse(
        'This learner is not currently flagged at-risk by RCLTP — no remedial plan is needed',
        409
      );
    }
    return errorResponse(result.error || 'Failed to enqueue remedial plan', 500);
  }

  return successResponse({
    planId: result.planId,
    jobId: result.jobId,
    inFlight: result.inFlight ?? false,
    status: 'queued',
  });
});
