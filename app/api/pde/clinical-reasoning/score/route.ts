/**
 * POST /api/pde/clinical-reasoning/score
 * ============================================================================
 *
 * Server endpoint called after the final question of a clinical-reasoning
 * attempt is submitted. Computes the OSCE score across all rubric domains and
 * writes the four downstream effects:
 *
 *   1. UPDATE pde_submissions (auto_score / final_score / passed / osce_score)
 *      — via the SERVICE-ROLE client: the table has no RLS UPDATE policy, so a
 *      session-scoped update silently matches zero rows and raises nothing.
 *   2. UPSERT pde_learner_capabilities (keeping max score — "best score wins")
 *   3. INSERT pde_engagement_events (event_type='clinical_case_completed')
 *   4. If score ≥ clinical_reasoning.evidence_threshold_pct (default 60):
 *      INSERT quality_evidence_mappings (DCI Criterion 2.3 evidence)
 *
 * Auth: cookie SSR getUser; learner_id resolved from profiles.learner_id.
 * Anyone can score their own attempt (RLS on pde_submissions limits visibility
 * to the learner themselves + faculty + admin).
 *
 * Scoring is idempotent by default: a submission that already carries a rubric
 * score is returned untouched (`already_scored: true`). Pass `rescore: true` to
 * deliberately score it again. Without that guard a repeat POST overwrote a
 * committed pass with 0.
 *
 * Body shape:
 *   { submissionId: string, rescore?: boolean }
 *     (submissionId is the only required input — everything else is resolved
 *      from the submission row)
 *
 * Response: { osce_score: OsceScore, passed: boolean, evidence_created: boolean,
 *             already_scored: boolean, warnings: {...} }
 *
 * Spec: specs/aicbl-as-pde-clinical-reasoning-2026-05-21.md (Agent E, step 3-6)
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import {
  scoreAttempt,
  parseRubricFromAssessment,
  deriveFallbackRubric,
  readStoredAnswers,
  type PdeQuestion,
  type OsceScore,
} from '@/lib/services/pde-osce-scoring';

interface RequestBody {
  submissionId: string;
  /**
   * Deliberately score an already-scored submission again. Without it a repeat
   * POST is a no-op that returns the stored score — see unwrapStoredAnswers.
   */
  rescore?: boolean;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function getEvidenceThresholdPct(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc(
      'fn_get_policy_clinical_reasoning',
      { p_key: 'evidence_threshold_pct', p_default: 60 },
    );
    if (error) return 60;
    if (typeof data === 'number') return data;
    if (typeof data === 'string') {
      const n = Number(data);
      return Number.isFinite(n) ? n : 60;
    }
    return 60;
  } catch {
    return 60;
  }
}

async function getPassingThresholdPct(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc(
      'fn_get_policy_clinical_reasoning',
      { p_key: 'scoring.passing_threshold_pct', p_default: 60 },
    );
    if (error) return 60;
    if (typeof data === 'number') return data;
    if (typeof data === 'string') {
      const n = Number(data);
      return Number.isFinite(n) ? n : 60;
    }
    return 60;
  } catch {
    return 60;
  }
}

/**
 * Plain-English note when the authored rubric does not claim every question.
 * Those questions are scored by nothing, which is a rubric-authoring gap the
 * caller must be able to see rather than infer from a suspiciously low total.
 */
function coverageWarning(uncovered: number[] | undefined): string | null {
  if (!uncovered || uncovered.length === 0) return null;
  const list = uncovered.map((n) => `Q${n}`).join(', ');
  return `${list} ${uncovered.length === 1 ? 'is' : 'are'} claimed by no rubric domain and contributed nothing to this score. Fix the rubric on the assessment.`;
}

// ----------------------------------------------------------------------------
// POST
// ----------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();

  // ---- Auth ---------------------------------------------------------------
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // ---- Body ---------------------------------------------------------------
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.submissionId) {
    return NextResponse.json(
      { error: 'submissionId is required' },
      { status: 400 },
    );
  }

  // ---- Load submission + assessment + questions ---------------------------
  const { data: submission, error: subErr } = await supabase
    .from('pde_submissions')
    .select(
      'id, assessment_id, learner_id, attempt_number, answers, final_score, passed',
    )
    .eq('id', body.submissionId)
    .maybeSingle();
  if (subErr || !submission) {
    return NextResponse.json(
      { error: 'Submission not found' },
      { status: 404 },
    );
  }

  // ---- Re-entry guard ------------------------------------------------------
  // Scoring is destructive: it overwrites final_score / passed. A repeat POST
  // (double click, client retry, StrictMode double-invoke) must not silently
  // replace a committed pass. Default is an idempotent no-op returning the
  // stored score; `rescore: true` is the deliberate opt-in to score again.
  const stored = readStoredAnswers(submission.answers);
  if (stored.osceScore && !body.rescore) {
    return NextResponse.json({
      osce_score: stored.osceScore,
      passed: submission.passed === true,
      evidence_created: false,
      already_scored: true,
      warnings: {
        learner_capability_error: null,
        evidence_error: null,
        uncovered_q_numbers: stored.osceScore.uncovered_q_numbers ?? [],
        rubric_coverage: coverageWarning(stored.osceScore.uncovered_q_numbers),
      },
    });
  }

  const { data: assessment, error: aErr } = await supabase
    .from('pde_assessments')
    .select('id, title, rubric, lesson_id, course_id')
    .eq('id', submission.assessment_id)
    .maybeSingle();
  if (aErr || !assessment) {
    return NextResponse.json(
      { error: 'Assessment not found' },
      { status: 404 },
    );
  }

  // The answer key (correct_answer / metadata.ground_truth) lives on
  // pde_assessment_questions, which learners can no longer SELECT after the
  // pde_questions_read RLS tighten. Ownership of this submission is already
  // enforced above — the session-client read returns 404 for a submission that
  // is not the caller's — so reading the key with the service-role client here
  // is both safe and necessary for server-side scoring.
  const svc = createServiceRoleClient();
  const { data: questionRows, error: qErr } = await svc
    .from('pde_assessment_questions')
    .select(
      'id, question_text, correct_answer, metadata, order_index, question_type',
    )
    .eq('assessment_id', submission.assessment_id)
    .order('order_index', { ascending: true });
  if (qErr) {
    return NextResponse.json(
      { error: `Failed to load questions: ${qErr.message}` },
      { status: 500 },
    );
  }

  // Map DB rows -> scoring service shape
  const questions: PdeQuestion[] = (questionRows ?? []).map((q, idx) => {
    const meta = (q.metadata ?? {}) as Record<string, unknown>;
    const qNumber =
      typeof meta.q_number === 'number' ? meta.q_number : idx + 1;
    const keyConcepts = Array.isArray(meta.key_concepts)
      ? (meta.key_concepts as string[]).filter((s) => typeof s === 'string')
      : [];
    return {
      id: q.id,
      q_number: qNumber,
      question_text: q.question_text,
      ground_truth: q.correct_answer ?? '',
      key_concepts: keyConcepts,
      // Drives the derived rubric when the assessment has no authored one.
      osce_domain:
        typeof meta.osce_domain === 'string' ? meta.osce_domain : null,
    };
  });

  // Answers were normalised out of both stored shapes above (readStoredAnswers).
  const answerItems = stored.items;
  const answers = stored.answers;

  // ---- Rubric: from assessment.rubric or derived from the questions -------
  // Every production assessment has rubric = NULL, so the derived path is the
  // one that actually runs. It covers every question the case asks; the old
  // hard-coded fallback stopped at Q4 while every case asks 7 or 8.
  const parsed = parseRubricFromAssessment(assessment.rubric);
  const rubricDomains =
    parsed.length > 0 ? parsed : deriveFallbackRubric(questions);

  // ---- Score --------------------------------------------------------------
  let osce: OsceScore;
  try {
    osce = await scoreAttempt({
      supabase,
      assessmentId: submission.assessment_id,
      caseTitle: assessment.title,
      questions,
      answers,
      rubricDomains,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: `Scoring failed: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 502 },
    );
  }

  // ---- Side effect 1: write-back to pde_submissions.metadata --------------
  // pde_submissions has no metadata column directly visible in schema above,
  // but it does have auto_score + final_score. Update final_score with the
  // percentage and store the rich osce_score breakdown in the answers JSONB
  // metadata block.
  const passingPct = await getPassingThresholdPct(supabase);
  const passed = osce.percentage >= passingPct;

  // This write MUST go through the service-role client. pde_submissions has RLS
  // enabled with only INSERT + SELECT policies — there is no UPDATE policy and
  // no ALL policy. Under RLS a missing UPDATE policy matches zero rows and
  // raises NOTHING, so the session-scoped update this used to run reported
  // success while the honest score never landed: the naive client-computed
  // score stayed in pde_submissions forever, and one attempt could show 100%
  // here while the rubric score written to pde_learner_capabilities was a fail.
  // Adding an RLS UPDATE policy would be worse — USING (learner_id = auth.uid())
  // would let a learner forge their own final_score straight through the REST
  // API with the public anon key. Server-side service-role is the trust
  // boundary; ownership was already proven by the session-scoped read above,
  // which 404s for a submission that is not the caller's.
  const { data: updatedRows, error: updSubErr } = await svc
    .from('pde_submissions')
    .update({
      auto_score: osce.percentage,
      final_score: osce.percentage,
      passed,
      completed_at: new Date().toISOString(),
      // Always the NORMALISED envelope list, never whatever shape was read.
      // Writing the previous wrapper back in here is what nested `items` one
      // level deeper on every repeat POST.
      answers: {
        items: answerItems,
        osce_score: osce,
      } as unknown,
    })
    .eq('id', submission.id)
    .select('id');
  if (updSubErr) {
    return NextResponse.json(
      {
        error: `Failed to write submission score: ${updSubErr.message}`,
      },
      { status: 500 },
    );
  }
  // A zero-row update is the exact failure this fix exists to kill — it is never
  // success. Fail loudly rather than returning a score that was not stored.
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json(
      {
        error:
          'Failed to write submission score: the update affected 0 rows. The score was NOT stored.',
      },
      { status: 500 },
    );
  }

  // ---- Side effect 2: upsert pde_learner_capabilities (keep max) ----------
  // Look up the clinical_reasoning capability_id once (could also seed via env)
  let capabilityId: string | null = null;
  let learnerCapErrorMsg: string | null = null;
  try {
    const { data: capRow } = await supabase
      .from('pde_capabilities')
      .select('id')
      .eq('slug', 'clinical_reasoning')
      .maybeSingle();
    capabilityId = (capRow?.id as string | undefined) ?? null;
  } catch {
    capabilityId = null;
  }

  if (capabilityId) {
    // Service-role client for the upsert — bypasses RLS for system-driven
    // capability writes (matches the pattern other PDE auto-grade paths use).
    let svc;
    try {
      svc = createServiceRoleClient();
    } catch {
      svc = null;
    }
    const writer = svc ?? supabase;

    // Read existing best score (if any)
    const { data: existing } = await writer
      .from('pde_learner_capabilities')
      .select('id, demonstration_score, status')
      .eq('learner_id', submission.learner_id)
      .eq('capability_id', capabilityId)
      .maybeSingle();

    const existingScore =
      typeof existing?.demonstration_score === 'number'
        ? existing.demonstration_score
        : 0;
    const newBest = Math.max(existingScore, osce.percentage);
    const newStatus = newBest >= passingPct ? 'demonstrated' : 'in_progress';

    const evidence = {
      submission_id: submission.id,
      attempt_number: submission.attempt_number,
      domain_scores: osce.domain_scores,
      total_score: osce.total_score,
      max_score: osce.max_score,
      percentage: osce.percentage,
      scored_at: new Date().toISOString(),
    };

    const { error: capErr } = await writer
      .from('pde_learner_capabilities')
      .upsert(
        {
          learner_id: submission.learner_id,
          capability_id: capabilityId,
          demonstration_score: newBest,
          status: newStatus,
          demonstration_evidence: evidence,
          demonstrated_at:
            newStatus === 'demonstrated' ? new Date().toISOString() : null,
        },
        { onConflict: 'learner_id,capability_id' },
      );
    if (capErr) {
      // Soft-fail: don't block the response, but surface the error.
      learnerCapErrorMsg = capErr.message;
    }
  } else {
    learnerCapErrorMsg =
      "pde_capabilities row with slug='clinical_reasoning' not found";
  }

  // ---- Side effect 3: pde_engagement_events row ---------------------------
  const { error: evtErr } = await supabase.from('pde_engagement_events').insert({
    learner_id: submission.learner_id,
    // event_type is varchar in DB — cast through unknown to bypass the
    // narrow TS union in types/pde.ts (clinical_case_completed isn't listed there).
    event_type: 'clinical_case_completed' as unknown as never,
    course_id: assessment.course_id ?? null,
    lesson_id: assessment.lesson_id ?? null,
    metadata: {
      assessment_id: submission.assessment_id,
      submission_id: submission.id,
      attempt_number: submission.attempt_number,
      score_pct: osce.percentage,
      passed,
    },
  });
  if (evtErr) {
    // non-fatal — log but continue
    console.error('[score] engagement event insert failed:', evtErr.message);
  }

  // ---- Side effect 4: quality_evidence_mappings (if above threshold) ------
  const evidenceThreshold = await getEvidenceThresholdPct(supabase);
  let evidenceCreated = false;
  let evidenceErrorMsg: string | null = null;

  if (osce.percentage >= evidenceThreshold) {
    // Resolve institution_id from the learner.
    let institutionId: string | null = null;
    try {
      const { data: lp } = await supabase
        .from('learners_profiles')
        .select('institution_id')
        .eq('id', submission.learner_id)
        .maybeSingle();
      institutionId = (lp?.institution_id as string | null) ?? null;
    } catch {
      institutionId = null;
    }

    if (institutionId) {
      const svcEv = (() => {
        try {
          return createServiceRoleClient();
        } catch {
          return null;
        }
      })();
      const writer = svcEv ?? supabase;
      const { error: mapErr } = await writer
        .from('quality_evidence_mappings')
        .insert({
          source_table: 'pde_submissions',
          source_id: submission.id,
          institution_id: institutionId,
          body_code: 'DCI',
          metric_code: 'CRITERION_2_3_CLINICAL_DEMONSTRATION',
          period_label: new Date().toISOString().slice(0, 7), // 'YYYY-MM'
          mapped_by: user.id,
          is_auto: true,
          metadata: {
            assessment_id: submission.assessment_id,
            attempt_number: submission.attempt_number,
            score_pct: osce.percentage,
            threshold_pct: evidenceThreshold,
            domain_scores: osce.domain_scores,
          },
        });
      if (mapErr) {
        evidenceErrorMsg = mapErr.message;
      } else {
        evidenceCreated = true;
      }
    } else {
      evidenceErrorMsg = 'learner institution_id not found';
    }
  }

  // A question no rubric domain claims is scored by nothing. Surface it on the
  // response AND in the server log — it is an authoring gap on the assessment,
  // invisible in the score itself.
  const rubricCoverage = coverageWarning(osce.uncovered_q_numbers);
  if (rubricCoverage) {
    console.warn(
      `[pde/clinical-reasoning] assessment ${submission.assessment_id}: ${rubricCoverage}`,
    );
  }

  return NextResponse.json({
    osce_score: osce,
    passed,
    evidence_created: evidenceCreated,
    already_scored: false,
    warnings: {
      learner_capability_error: learnerCapErrorMsg,
      evidence_error: evidenceErrorMsg,
      uncovered_q_numbers: osce.uncovered_q_numbers ?? [],
      rubric_coverage: rubricCoverage,
    },
  });
}
