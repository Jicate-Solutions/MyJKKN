/**
 * POST /api/rcltp/questions/generate
 * RCLTP v2 Phase 3 (GROUP B — EKSAQ-content-gated body).
 * Auto-generate Part B comprehension questions from a passage (D6: AI-generate
 * + teacher review). Generated questions are meant to land source='ai_generated',
 * status='draft' for a teacher to approve.
 *
 * SCAFFOLDED NOW: auth, institution scoping, passage fetch, and the LLM CLIENT
 * WIRING — reusing the production pattern from app/api/work-pulse/analyze/route.ts
 * (`new Anthropic({ apiKey })`), NOT a new client. DEFERRED (EKSAQ content): the
 * passage→question PROMPT and the EKSAQ competency/band alignment guardrails — so
 * no pedagogy is fabricated. Returns an honest "awaiting EKSAQ content" 501.
 *
 * Gate: rcltp.assessment.manage (teachers/admins). Institution-scoped to the passage.
 * Body: { passage_id }
 */

export const dynamic = 'force-dynamic';

import Anthropic from '@anthropic-ai/sdk';
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
  eksaqGatedResponse,
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

    // LLM CLIENT WIRING (reuse work-pulse/analyze pattern; do NOT invent a new client).
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!ANTHROPIC_KEY) {
      return errorResponse('ANTHROPIC_API_KEY not configured', 503, 'LLM_UNCONFIGURED');
    }
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    // EKSAQ-gated: the passage→question prompt + competency/band guardrails are
    // EKSAQ content. The client is wired and constructs on prod; the prompt is deferred.
    return eksaqGatedResponse(
      'AI comprehension-question generation prompt + EKSAQ competency/band guardrails',
      { passage_id: passage.id, llm_client_ready: anthropic instanceof Anthropic }
    );
  },
  { requirePermission: 'rcltp.assessment.manage', allowApiKey: false }
);
