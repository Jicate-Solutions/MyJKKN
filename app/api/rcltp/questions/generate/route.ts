/**
 * POST /api/rcltp/questions/generate
 * RCLTP v2 Phase 3 (GROUP B — MyJKKN-content-gated body).
 * Auto-generate Part B comprehension questions from a passage (D6: AI-generate
 * + teacher review). Generated questions are meant to land source='ai_generated',
 * status='draft' for a teacher to approve.
 *
 * SCAFFOLDED NOW: auth, institution scoping, passage fetch, and the LLM CLIENT
 * WIRING — reusing the production pattern from app/api/work-pulse/analyze/route.ts
 * (`new Anthropic({ apiKey })`), NOT a new client. DEFERRED (MyJKKN content): the
 * passage→question PROMPT and the MyJKKN competency/band alignment guardrails — so
 * no pedagogy is fabricated. Returns an honest "awaiting MyJKKN content" 501.
 *
 * Gate: rcltp.assessment.manage (teachers/admins). Institution-scoped to the passage.
 * Body: { passage_id }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { generateQuestionsForPassage } from '@/lib/services/rcltp/question-generation-service';
import { withAuth } from '@/lib/auth/with-auth';
import {
  errorResponse,
  forbiddenResponse,
  notFoundResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import {
  rcltpAdminClient,
  readJson,
  actorMayActOnInstitution,
  isPlatformAdmin,
} from '@/app/api/rcltp/_lib/route-helpers';

interface GenerateBody {
  passage_id?: string;
}

export const POST = withAuth(
  async (request, auth) => {
    const body = await readJson<GenerateBody>(request);
    if (!body.passage_id) return errorResponse('passage_id is required', 400);

    const admin = rcltpAdminClient();
    const { data: passage, error: fErr } = await admin
      .from('rcltp_passages')
      .select('id, institution_id, language, grade_level, content_level')
      .eq('id', body.passage_id)
      .maybeSingle();
    if (fErr) return handleSupabaseError(fErr);
    if (!passage) return notFoundResponse('Passage');

    // Institution scoping: institution-owned passages require institution access;
    // global passages (institution_id NULL) require a platform admin.
    const allowed = passage.institution_id
      ? await actorMayActOnInstitution(auth, passage.institution_id)
      : await isPlatformAdmin(auth);
    if (!allowed) return forbiddenResponse('You may not generate questions for this passage');

    // Generate → answer-key double-check → write status='draft' rows. AI authors;
    // a Senior Learner approves via the review console (nothing here auto-approves).
    const result = await generateQuestionsForPassage(admin, passage.id);
    if (!result.ok) {
      const status =
        result.reason === 'not_found' ? 404 : result.reason === 'no_key' ? 503 : 422;
      return errorResponse(
        result.error || `Could not generate questions (${result.reason ?? 'unknown'})`,
        status
      );
    }
    return NextResponse.json({ success: true, count: result.count, passage_id: passage.id });
  },
  { requirePermission: 'rcltp.assessment.manage', allowApiKey: false }
);
