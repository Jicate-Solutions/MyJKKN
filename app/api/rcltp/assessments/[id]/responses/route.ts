/**
 * POST /api/rcltp/assessments/:id/responses
 * RCLTP v2 Phase 3 — student records Part B answers (raw capture, LAST-WINS).
 * Upserts on (assessment_id, question_id): re-answering a question before submit
 * OVERWRITES the prior answer (one authoritative row per question). is_correct /
 * score stay NULL and auto_graded = false — grading is the MyJKKN scoring step
 * (gated). We never fabricate grades here.
 * Gate: rcltp.assessment.take. Ownership: parent assessment → session learner.
 * Status-guarded (open sittings only); question_ids validated against the assessment's
 * passage (approved + in-tenant/global) so no foreign/draft question can be referenced.
 * Body: { responses: [{ question_id, response? }] }
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

interface ResponsesBody {
  responses?: Array<{ question_id?: string; response?: string }>;
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

    const body = await readJson<ResponsesBody>(request);
    const responses = Array.isArray(body.responses) ? body.responses : [];
    if (responses.length === 0) return errorResponse('responses[] is required', 400);
    if (responses.some((r) => !r || typeof r.question_id !== 'string')) {
      return errorResponse('each response requires a question_id', 400);
    }

    const admin = rcltpAdminClient();

    // OWNERSHIP via parent assessment.
    const { data: a, error: fErr } = await admin
      .from('rcltp_assessments')
      .select('id, learner_id, institution_id, status, passage_id')
      .eq('id', assessmentId)
      .maybeSingle();
    if (fErr) return handleSupabaseError(fErr);
    if (!a) return notFoundResponse('Assessment');
    if (a.learner_id !== learnerId || a.institution_id !== auth.user.institution_id) {
      return forbiddenResponse('This assessment does not belong to you');
    }

    // STATE GUARD — answers may only be recorded while the sitting is open (mirror submit).
    if (!['in_progress', 'recorded'].includes(a.status)) {
      return errorResponse(
        `Cannot record responses for an assessment in status "${a.status}"`,
        409
      );
    }

    // The submitted questions MUST belong to this assessment's passage, be approved, and be
    // in-tenant (or global) — stops a student attaching a foreign/draft question_id to a row.
    if (!a.passage_id) {
      return errorResponse(
        'This assessment has no passage; Part B responses are not applicable',
        409
      );
    }
    const { data: validQs, error: qErr } = await admin
      .from('rcltp_part_b_questions')
      .select('id')
      .eq('passage_id', a.passage_id)
      .eq('status', 'approved')
      .or(`institution_id.eq.${a.institution_id},institution_id.is.null`);
    if (qErr) return handleSupabaseError(qErr);
    const allowedQuestionIds = new Set((validQs ?? []).map((q: { id: string }) => q.id));
    if (responses.some((r) => !allowedQuestionIds.has(r.question_id as string))) {
      return forbiddenResponse(
        'A response references a question that is not part of this assessment'
      );
    }

    // Last-wins WITHIN a single payload too: collapse duplicate question_ids
    // (keep the last) so the upsert never hits the same conflict target twice
    // in one statement (Postgres rejects that with a runtime error otherwise).
    const byQuestion = new Map<string, (typeof responses)[number]>();
    for (const r of responses) byQuestion.set(r.question_id as string, r);

    const rows = Array.from(byQuestion.values()).map((r) => ({
      assessment_id: assessmentId,
      question_id: r.question_id,
      institution_id: auth.user.institution_id,
      response: r.response ?? null,
      // Raw capture — grading is deferred to the MyJKKN scoring step.
      auto_graded: false,
    }));

    // LAST-WINS: upsert on the (assessment_id, question_id) unique key so a
    // re-answer overwrites rather than appending a duplicate row.
    const { data, error: iErr } = await admin
      .from('rcltp_part_b_responses')
      .upsert(rows, { onConflict: 'assessment_id,question_id' })
      .select();
    if (iErr) return handleSupabaseError(iErr);
    return successResponse(data);
  },
  { requirePermission: 'rcltp.assessment.take', allowApiKey: false }
);
