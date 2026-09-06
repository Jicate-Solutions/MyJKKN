// lib/services/aiu/prompt-trail-service.ts
// ============================================================================
// AIU (Accountable AI Use) evidence trail — capture what the in-app AI
// produced BEFORE the learner changed it.
//
// The AIU element of JKKN Advanced Bloom's Taxonomy has rubric bands
// (AIU-a Supervised / AIU-b Accountable / AIU-c Discerning) that are
// unmarkable without a record of the AI's output as produced, the learner's
// version at that moment, and the learner's final version. This module is the
// logging seam behind supabase/migrations/20260922041500_aiu_prompt_trails.sql.
//
// TWO writes, both BEST-EFFORT BY DESIGN — a trail failure must never break
// the learner-facing feature it observes:
//   • recordAiuTrailDelivery       — when an AI output is delivered to a
//     learner (PDE coach route, clinical branch). One row per delivery; a
//     learner who asks the coach three times gets three rows — the chain IS
//     the revision trail.
//   • finalizeAiuTrailsForSubmission — when the learner's final answers are
//     saved (OSCE score route). Closes every still-open trail for that
//     attempt with the final answer and a changed-or-accepted flag.
//
// Until the migration is applied the table does not exist: both writers log
// one console.error and return harmlessly, so the code half can merge first.
//
// ID SEMANTICS: learnerId is profiles.id (auth.users.id) — the id space the
// whole PDE clinical loop uses. NOT learners_profiles.id.
//
// SERVER-ONLY by convention: callers pass a server-side Supabase client
// (session-scoped where RLS should bind the row to the caller, service-role
// where ownership was already proven). Nothing here creates a client.
// ============================================================================

/** Surface identifier for the PDE clinical-reasoning Socratic coach. */
export const AIU_SURFACE_PDE_CLINICAL_COACH = 'pde.clinical_reasoning.coach';

// Loose client shape — the generated Database types do not know
// aiu_prompt_trails yet (the migration is FILE ONLY), and every PDE caller
// already accesses these tables through an any-cast. Keeping the seam typed
// against this minimal surface also makes the unit tests trivial.
export interface AiuDbClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

export interface AiuTrailDeliveryArgs {
  /** profiles.id (auth.users.id) of the acting learner. */
  learnerId: string;
  /** Surface identifier, e.g. AIU_SURFACE_PDE_CLINICAL_COACH. */
  surface: string;
  /** The exact prompt sent to the model. Never echo this to the client —
   *  on the PDE coach it embeds ground_truth (the answer key). */
  promptSent: string;
  /** The AI output exactly as produced. */
  aiOutput: string;
  /** The learner's version of their work at the moment the AI saw it. */
  learnerInput: string | null;
  /** Context refs (assessment_id, question_id, ...). */
  context: Record<string, unknown>;
  /** Optional — resolved from profiles.institution_id when omitted. */
  institutionId?: string | null;
}

export interface AiuTrailFinalizeArgs {
  /** profiles.id of the learner who owns the submission. */
  learnerId: string;
  /** Surface whose open trails should be closed. */
  surface: string;
  /** pde_assessments.id the trails were recorded against. */
  assessmentId: string;
  /** The submission's answers payload, in any of the shapes this repo
   *  actually writes (see extractFinalAnswerForQuestion). */
  answersRaw: unknown;
  /** pde_submissions.id — merged into context for the closed trails. */
  submissionId: string;
}

// ----------------------------------------------------------------------------
// Pure helpers (exported for the unit suite)
// ----------------------------------------------------------------------------

/** Collapse an answer value to trimmed text, or null when there is nothing
 *  usable. Objects are NOT stringified — a structured value (e.g. an
 *  image-tag click point) is not a learner-authored text revision. */
export function normalizeAnswerText(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/**
 * Pull one question's final answer out of a pde_submissions.answers payload.
 *
 * Shapes tolerated — all three are live in this repo:
 *   1. ClinicalAnswerEnvelope[]: [{ question_id, answer_text, ... }]
 *      (the clinical CaseAttempt flow; fields answer_text / student_answer /
 *      answer, matching the OSCE score route's own tolerance).
 *   2. { items: [...] } — the score route's post-write wrapper.
 *   3. Record keyed by question id: { [questionId]: value } (the legacy
 *      /api/pde/assessments/[id]/submit shape read by the results route).
 */
export function extractFinalAnswerForQuestion(
  answersRaw: unknown,
  questionId: string,
): string | null {
  if (!answersRaw || !questionId) return null;

  let payload: unknown = answersRaw;
  if (
    !Array.isArray(payload) &&
    typeof payload === 'object' &&
    Array.isArray((payload as Record<string, unknown>).items)
  ) {
    payload = (payload as Record<string, unknown>).items;
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== 'object') continue;
      const o = entry as Record<string, unknown>;
      if (o.question_id !== questionId) continue;
      return (
        normalizeAnswerText(o.answer_text) ??
        normalizeAnswerText(o.student_answer) ??
        normalizeAnswerText(o.answer)
      );
    }
    return null;
  }

  if (typeof payload === 'object') {
    return normalizeAnswerText((payload as Record<string, unknown>)[questionId]);
  }

  return null;
}

/**
 * changed-or-accepted: true = the learner revised their work after the AI
 * engagement; false = kept it unchanged; null = cannot be judged (no final,
 * or no baseline was captured at delivery time).
 */
export function computeChanged(
  learnerInput: string | null | undefined,
  learnerFinal: string | null | undefined,
): boolean | null {
  if (learnerFinal === null || learnerFinal === undefined) return null;
  if (learnerInput === null || learnerInput === undefined) return null;
  return learnerInput.trim() !== learnerFinal.trim();
}

// ----------------------------------------------------------------------------
// DB writers — best-effort, never throw
// ----------------------------------------------------------------------------

/**
 * Record one delivered AI output. Returns the new trail id, or null when the
 * write failed (logged, swallowed — capture must never block the feature).
 */
export async function recordAiuTrailDelivery(
  client: AiuDbClient,
  args: AiuTrailDeliveryArgs,
): Promise<string | null> {
  try {
    let institutionId = args.institutionId ?? null;
    if (args.institutionId === undefined) {
      const { data: profile } = await client
        .from('profiles')
        .select('institution_id')
        .eq('id', args.learnerId)
        .maybeSingle();
      institutionId = (profile?.institution_id as string | undefined) ?? null;
    }

    const { data, error } = await client
      .from('aiu_prompt_trails')
      .insert({
        learner_id: args.learnerId,
        institution_id: institutionId,
        surface: args.surface,
        prompt_sent: args.promptSent,
        ai_output: args.aiOutput,
        learner_input: args.learnerInput,
        context: args.context,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[aiu] trail delivery capture failed:', error.message ?? error);
      return null;
    }
    return (data?.id as string | undefined) ?? null;
  } catch (err) {
    console.error(
      '[aiu] trail delivery capture failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Close every still-open trail for (learner, surface, assessment) with the
 * learner's final answer for its question. Idempotent: already-closed rows
 * are filtered out here AND re-guarded in the UPDATE predicate, and the DB
 * trigger makes learner_final write-once regardless. Returns the number of
 * trails closed; never throws.
 */
export async function finalizeAiuTrailsForSubmission(
  client: AiuDbClient,
  args: AiuTrailFinalizeArgs,
): Promise<number> {
  try {
    const { data: openTrails, error } = await client
      .from('aiu_prompt_trails')
      .select('id, learner_input, context')
      .eq('learner_id', args.learnerId)
      .eq('surface', args.surface)
      .eq('context->>assessment_id', args.assessmentId)
      .is('learner_final', null);

    if (error) {
      console.error('[aiu] trail finalize lookup failed:', error.message ?? error);
      return 0;
    }

    let closed = 0;
    for (const trail of (openTrails ?? []) as Array<{
      id: string;
      learner_input: string | null;
      context: Record<string, unknown> | null;
    }>) {
      const questionId =
        typeof trail.context?.question_id === 'string'
          ? (trail.context.question_id as string)
          : null;
      if (!questionId) continue;

      const learnerFinal = extractFinalAnswerForQuestion(args.answersRaw, questionId);
      // A coached question the learner never carried into the submission stays
      // open — closing it with an empty final would manufacture an "accepted".
      if (learnerFinal === null) continue;

      const { error: updError } = await client
        .from('aiu_prompt_trails')
        .update({
          learner_final: learnerFinal,
          changed: computeChanged(trail.learner_input, learnerFinal),
          context: { ...(trail.context ?? {}), submission_id: args.submissionId },
        })
        .eq('id', trail.id)
        .is('learner_final', null);

      if (updError) {
        console.error('[aiu] trail finalize update failed:', updError.message ?? updError);
        continue;
      }
      closed += 1;
    }
    return closed;
  } catch (err) {
    console.error(
      '[aiu] trail finalize failed:',
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}
