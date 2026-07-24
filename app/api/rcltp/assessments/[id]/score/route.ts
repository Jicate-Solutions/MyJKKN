/**
 * POST /api/rcltp/assessments/:id/score
 * RCLTP — run the PROVISIONAL scoring engine for one sitting.
 *
 * ⚠️ PROVISIONAL — the composite weights + band cutoffs are placeholders pending
 * MyJKKN validation (see lib/services/rcltp/scoring-engine.ts). Every UI surface
 * that renders a resulting band/score MUST show the "Provisional — pending MyJKKN
 * validation" banner.
 *
 * Auth: rcltp.review (teachers/reviewers/admins). The service-role write bypasses
 * RLS, so we re-assert the actor may act on the sitting's institution BEFORE
 * touching data. Body: { readingScore?: number } — the teacher's hand-entered
 * Part A (read-aloud) score 0–100 (Phase 1; Phase 4 replaces it with voice-AI).
 * Omit for a consent-driven Part-B-only sitting.
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
import {
  rcltpAdminClient,
  actorMayActOnInstitution,
  readJson,
} from '@/app/api/rcltp/_lib/route-helpers';
import { runScoring } from '@/lib/services/rcltp/scoring-engine';

export const POST = withAuth(
  async (request, auth, context) => {
    const params = await context?.params;
    const assessmentId = params?.id;
    if (!assessmentId) return errorResponse('Assessment id is required', 400);

    const body = await readJson<{ readingScore?: number | null }>(request);
    if (
      body.readingScore != null &&
      (typeof body.readingScore !== 'number' ||
        !Number.isFinite(body.readingScore) ||
        body.readingScore < 0 ||
        body.readingScore > 100)
    ) {
      return errorResponse('readingScore must be a number between 0 and 100', 400);
    }

    const admin = rcltpAdminClient();
    const { data: a, error: fErr } = await admin
      .from('rcltp_assessments')
      .select('id, institution_id, status')
      .eq('id', assessmentId)
      .maybeSingle();
    if (fErr) return handleSupabaseError(fErr);
    if (!a) return notFoundResponse('Assessment');

    // Multi-tenant boundary (service-role bypasses RLS).
    if (!(await actorMayActOnInstitution(auth, a.institution_id))) {
      return forbiddenResponse('You may not score assessments in this institution');
    }

    // State guard: score a sitting that has been submitted/recorded, or re-score
    // one already scored (idempotent — upsert on assessment_id). Block sittings
    // that never started.
    if (['scheduled', 'not_attempted'].includes(a.status)) {
      return errorResponse(
        `Cannot score an assessment in status "${a.status}" — it has not been taken`,
        409
      );
    }

    try {
      const outcome = await runScoring(admin, assessmentId, {
        readingScore: body.readingScore ?? null,
      });
      return successResponse({
        ...outcome.result,
        _graded_responses: outcome.gradedResponses,
        _provisional: true,
        _provisional_note:
          'Provisional score — pending MyJKKN validation. Not an authoritative band.',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Scoring failed';
      return errorResponse(`RCLTP scoring failed: ${msg}`, 500);
    }
  },
  { requirePermission: 'rcltp.review', allowApiKey: false }
);
