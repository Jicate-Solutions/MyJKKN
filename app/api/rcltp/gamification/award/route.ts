/**
 * POST /api/rcltp/gamification/award
 * RCLTP v2 Phase 3 — award a named badge to a learner, SERVER-SIDE ONLY, via the
 * SECURITY DEFINER fn_rcltp_award_badge (service_role EXECUTE only). E2 integrity:
 * a student cannot self-award — this route is gated rcltp.assessment.manage, which
 * students (assessment.take only) do NOT hold, AND the underlying RPC is service-role.
 *
 * MULTI-TENANT: the institution is derived from the AUTHORITATIVE learner record
 * (learners_profiles), NOT from the request body — so a teacher cannot award a
 * learner outside their institution by supplying their own institution_id.
 *
 * SCOPE NOTE: this is the AWARD WIRING. It does NOT decide WHICH badge to award —
 * the badge CRITERIA (and the badge catalog seed) are MyJKKN/admin content. The
 * caller passes a badge_slug explicitly. Until a catalog row exists, the RPC raises
 * "badge not found" (expected — wiring is live, content is awaited).
 *
 * Body: { learner_id, badge_slug, evidence? }
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

interface AwardBody {
  learner_id?: string;
  badge_slug?: string;
  evidence?: string;
}

export const POST = withAuth(
  async (request, auth) => {
    const body = await readJson<AwardBody>(request);
    if (!body.learner_id || !body.badge_slug) {
      return errorResponse('learner_id and badge_slug are required', 400);
    }

    const admin = rcltpAdminClient();

    // Institution from the AUTHORITATIVE learner record — never the body.
    const institutionId = await resolveLearnerInstitution(admin, body.learner_id);
    if (!institutionId) return notFoundResponse('Learner (or learner institution)');

    // The actor must be authorized for the LEARNER's institution (admins cross-tenant).
    if (!(await actorMayActOnInstitution(auth, institutionId))) {
      return forbiddenResponse('You may not award badges to this learner');
    }

    const { data, error } = await admin.rpc('fn_rcltp_award_badge', {
      p_learner_id: body.learner_id,
      p_badge_slug: body.badge_slug,
      p_institution_id: institutionId,
      p_evidence: body.evidence ?? null,
    });
    if (error) {
      // The DEFINER RPC RAISEs when the slug is unknown/inactive (no catalog seeded
      // yet = awaiting MyJKKN content). Surface as a 400, not a 500.
      return errorResponse(error.message || 'Award failed', 400, 'AWARD_FAILED');
    }

    // RPC returns the new learner_badge id, or null when already earned (idempotent).
    return successResponse({ learner_badge_id: data ?? null, already_earned: data === null });
  },
  { requirePermission: 'rcltp.assessment.manage', allowApiKey: false }
);
