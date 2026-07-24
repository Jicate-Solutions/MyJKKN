/**
 * MyJKKN RCLTP — PROVISIONAL scoring engine (server-side)
 * ============================================================================
 * ⚠️  PROVISIONAL — pending MyJKKN validation. Implements the scoring model the
 *     MyJKKN specs define, but the composite weights and band cutoffs are the
 *     provisional placeholders from `specs/myjkkn-rcltp-sample-content-DRAFT.md`
 *     (§B, all marked "placeholder"). EVERY surface that shows a band/score from
 *     this engine MUST carry the "Provisional — pending MyJKKN validation" banner.
 *     When MyJKKN delivers validated numbers, override the per-tenant
 *     `rcltp_band_config` rows and the PROVISIONAL_WEIGHTS below — no rebuild of
 *     the band-mapping logic is required.
 *
 * Pure functions (gradePartB / mapScoreToBand / computeComposite) are exported
 * for unit testing; `runScoring()` is the service-role orchestrator invoked by
 * POST /api/rcltp/assessments/[id]/score.
 *
 * This engine NEVER runs on the browser client — it writes results/journey rows
 * that learners have no RLS write access to. It always uses the service-role
 * admin client passed in by the route, which re-scopes every write by
 * institution_id + verified ownership (see route-helpers).
 * ============================================================================
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RcltpBand, RcltpDimension, RcltpAssessmentResult } from '@/types/rcltp';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>;

/** Provisional composite weights — MyJKKN to confirm (sample-content DRAFT §B). */
export const PROVISIONAL_WEIGHTS = { reading: 0.5, comprehension: 0.5 } as const;

/**
 * Provisional band cutoffs (inclusive, 0–100) — placeholders, MyJKKN to validate.
 * Used as the fallback when a tenant has no `rcltp_band_config` row for a
 * dimension. Per-tenant rows in `rcltp_band_config` OVERRIDE these.
 */
export const PROVISIONAL_CUTOFFS: ReadonlyArray<{
  band: RcltpBand;
  min: number;
  max: number;
}> = [
  { band: 'emergent', min: 0, max: 39 },
  { band: 'transitional', min: 40, max: 59 },
  { band: 'proficient', min: 60, max: 84 },
  { band: 'super_proficient', min: 85, max: 100 },
];

export interface BandCutoff {
  band: RcltpBand;
  min_score: number;
  max_score: number;
}

export interface PartBQuestion {
  id: string;
  correct_answer: string | null;
  max_score: number;
  /** ai_meta.is_stretch — an above-level "bonus" item: credited when correct but
   *  never counted against the core score (excluded from the denominator). */
  is_stretch?: boolean;
}
export interface PartBResponse {
  id: string;
  question_id: string;
  response: string | null;
}
export interface GradedResponse {
  id: string;
  is_correct: boolean;
  score: number;
}
export interface PartBResult {
  graded: GradedResponse[];
  /** 0–100 percent correct, or null when there are no gradable questions. */
  comprehensionScore: number | null;
}

/** Case/whitespace-insensitive answer match. Blank correct_answer is never gradable. */
function answersMatch(response: string | null, correct: string | null): boolean {
  if (correct == null || String(correct).trim() === '') return false;
  if (response == null) return false;
  const norm = (s: string) => s.trim().toLowerCase();
  return norm(response) === norm(String(correct));
}

/**
 * Auto-grade Part B (comprehension MCQs). Each response scores its question's
 * `max_score` when correct, else 0. Comprehension = Σscore / Σmax_score × 100.
 * Questions with a null/blank `correct_answer` are NOT gradable and are excluded
 * from both numerator and denominator (never guessed as correct).
 */
export function gradePartB(
  responses: PartBResponse[],
  questions: PartBQuestion[]
): PartBResult {
  const qById = new Map(questions.map((q) => [q.id, q]));
  const graded: GradedResponse[] = [];
  let earned = 0;
  let possible = 0;
  for (const r of responses) {
    const q = qById.get(r.question_id);
    if (!q) continue; // response to an unknown/removed question — skip
    if (q.correct_answer == null || String(q.correct_answer).trim() === '') {
      // ungradable (e.g. open-ended) — record 0/not-correct, exclude from totals
      graded.push({ id: r.id, is_correct: false, score: 0 });
      continue;
    }
    const max = Number(q.max_score) || 0;
    const correct = answersMatch(r.response, q.correct_answer);
    graded.push({ id: r.id, is_correct: correct, score: correct ? max : 0 });
    earned += correct ? max : 0;
    // Stretch (above-level bonus) items are credited to the numerator when correct
    // but EXCLUDED from the denominator — a struggling grade 3-4 reader who nails one
    // gets a lift toward 100, and a wrong stretch answer costs nothing (0 added to
    // both sides). clamp01to100 caps the result at 100.
    if (!q.is_stretch) possible += max;
  }
  const comprehensionScore =
    possible > 0 ? clamp01to100((earned / possible) * 100) : null;
  return { graded, comprehensionScore };
}

function clamp01to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Map a 0–100 score to a band using the tenant's cutoffs (or the provisional
 * fallback). Returns null for a null score. Picks the row whose [min,max]
 * inclusive window contains the score; if none matches (gaps), snaps to the
 * nearest boundary band so a valid score always yields a band.
 */
export function mapScoreToBand(
  score: number | null,
  cutoffs?: ReadonlyArray<BandCutoff>
): RcltpBand | null {
  if (score == null || !Number.isFinite(score)) return null;
  const s = clamp01to100(score);
  const rows = (cutoffs && cutoffs.length
    ? cutoffs.map((c) => ({ band: c.band, min: Number(c.min_score), max: Number(c.max_score) }))
    : PROVISIONAL_CUTOFFS
  )
    .slice()
    .sort((a, b) => a.min - b.min);
  for (const row of rows) {
    if (s >= row.min && s <= row.max) return row.band;
  }
  // no exact window (config gap): below-lowest → lowest band, above-highest → highest
  if (s < rows[0].min) return rows[0].band;
  return rows[rows.length - 1].band;
}

/**
 * Composite overall score. Both present → weighted (0.5/0.5 provisional). Only
 * one present → that dimension alone (a consent-driven Part-B-only sitting is
 * legitimate — spec: "no voice consent → Part B text-only"). Neither → null.
 */
export function computeComposite(
  reading: number | null,
  comprehension: number | null
): number | null {
  const r = reading != null && Number.isFinite(reading) ? clamp01to100(reading) : null;
  const c =
    comprehension != null && Number.isFinite(comprehension)
      ? clamp01to100(comprehension)
      : null;
  if (r != null && c != null) {
    return clamp01to100(
      PROVISIONAL_WEIGHTS.reading * r + PROVISIONAL_WEIGHTS.comprehension * c
    );
  }
  return r != null ? r : c;
}

// ---------------------------------------------------------------------------
// Server-side orchestrator
// ---------------------------------------------------------------------------

export interface RunScoringInput {
  /** Teacher-entered reading (Part A) score 0–100, Phase 1. Omit for Part-B-only. */
  readingScore?: number | null;
}
export interface RunScoringOutcome {
  result: RcltpAssessmentResult;
  gradedResponses: number;
}

/** Load a tenant's cutoffs for one dimension (active rows only); [] → use fallback. */
async function loadCutoffs(
  admin: Admin,
  institutionId: string,
  dimension: RcltpDimension
): Promise<BandCutoff[]> {
  const { data } = await admin
    .from('rcltp_band_config')
    .select('band, min_score, max_score')
    .eq('institution_id', institutionId)
    .eq('dimension', dimension)
    .eq('is_active', true);
  return (data ?? []) as BandCutoff[];
}

/**
 * Compute + persist the provisional result for one assessment sitting, then
 * advance the learner's journey. Service-role only; the route asserts the actor
 * may act on the institution BEFORE calling this.
 */
export async function runScoring(
  admin: Admin,
  assessmentId: string,
  input: RunScoringInput = {}
): Promise<RunScoringOutcome> {
  // 1. Load the sitting for tenant/learner/passage context.
  const { data: assessment, error: aErr } = await admin
    .from('rcltp_assessments')
    .select('id, institution_id, learner_id, passage_id, status')
    .eq('id', assessmentId)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!assessment) throw new Error('Assessment not found');
  const institutionId = assessment.institution_id as string;
  const learnerId = assessment.learner_id as string;

  // 2. Auto-grade Part B: responses for this sitting vs their questions.
  const { data: responses, error: rErr } = await admin
    .from('rcltp_part_b_responses')
    .select('id, question_id, response')
    .eq('assessment_id', assessmentId);
  if (rErr) throw rErr;
  const questionIds = Array.from(
    new Set((responses ?? []).map((r: PartBResponse) => r.question_id))
  );
  let questions: PartBQuestion[] = [];
  if (questionIds.length) {
    const { data: qs, error: qErr } = await admin
      .from('rcltp_part_b_questions')
      .select('id, correct_answer, max_score, ai_meta')
      .in('id', questionIds);
    if (qErr) throw qErr;
    questions = (qs ?? []).map((q: any) => ({
      id: q.id,
      correct_answer: q.correct_answer,
      max_score: q.max_score,
      is_stretch: q?.ai_meta?.is_stretch === true, // bonus item — excluded from denominator
    })) as PartBQuestion[];
  }
  const partB = gradePartB((responses ?? []) as PartBResponse[], questions);

  // 2b. Persist per-response grades (idempotent update).
  for (const g of partB.graded) {
    await admin
      .from('rcltp_part_b_responses')
      .update({
        is_correct: g.is_correct,
        score: g.score,
        auto_graded: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', g.id);
  }

  // 3. Reading (Part A): Phase-1 teacher hand-entry via the route body; else fall
  //    back to a reviewer-entered pron_score on the recording if one exists.
  let readingScore: number | null =
    input.readingScore != null && Number.isFinite(input.readingScore)
      ? clamp01to100(Number(input.readingScore))
      : null;
  if (readingScore == null) {
    const { data: rec } = await admin
      .from('rcltp_part_a_recordings')
      .select('pron_score, accuracy_score, scoring_status')
      .eq('assessment_id', assessmentId)
      .maybeSingle();
    const fromRec = rec?.pron_score ?? rec?.accuracy_score ?? null;
    if (fromRec != null && Number.isFinite(Number(fromRec))) {
      readingScore = clamp01to100(Number(fromRec));
    }
  }

  // 4. Bands (per-tenant cutoffs, provisional fallback) + composite.
  const [readCuts, compCuts, overallCuts] = await Promise.all([
    loadCutoffs(admin, institutionId, 'reading'),
    loadCutoffs(admin, institutionId, 'comprehension'),
    loadCutoffs(admin, institutionId, 'overall'),
  ]);
  const comprehensionScore = partB.comprehensionScore;
  const overallScore = computeComposite(readingScore, comprehensionScore);
  const readingBand = mapScoreToBand(readingScore, readCuts);
  const comprehensionBand = mapScoreToBand(comprehensionScore, compCuts);
  const overallBand = mapScoreToBand(overallScore, overallCuts);

  // 5. Carry the learner's prior overall for trend/delta, then upsert result
  //    (assessment_id is UNIQUE — one result per sitting).
  const { data: prior } = await admin
    .from('rcltp_assessment_results')
    .select('overall_score')
    .eq('learner_id', learnerId)
    .not('assessment_id', 'eq', assessmentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousOverall = prior?.overall_score ?? null;

  const now = new Date().toISOString();
  const { data: upserted, error: uErr } = await admin
    .from('rcltp_assessment_results')
    .upsert(
      {
        assessment_id: assessmentId,
        institution_id: institutionId,
        learner_id: learnerId,
        reading_band: readingBand,
        comprehension_band: comprehensionBand,
        overall_band: overallBand,
        reading_score: readingScore,
        comprehension_score: comprehensionScore,
        overall_score: overallScore,
        previous_overall_score: previousOverall,
        updated_at: now,
      },
      { onConflict: 'assessment_id' }
    )
    .select()
    .single();
  if (uErr) throw uErr;

  // 6. Mark the sitting scored.
  await admin
    .from('rcltp_assessments')
    .update({ status: 'scored', scored_at: now, updated_at: now })
    .eq('id', assessmentId);

  // 7. Advance the learner's journey (mastery-gated: band changes only when the
  //    new overall_band differs from the recorded current_band).
  if (overallBand) {
    await advanceJourney(admin, institutionId, learnerId, overallBand, now);
  }

  return {
    result: upserted as RcltpAssessmentResult,
    gradedResponses: partB.graded.length,
  };
}

/** Upsert the learner's overall-dimension journey, appending a progression entry. */
async function advanceJourney(
  admin: Admin,
  institutionId: string,
  learnerId: string,
  overallBand: RcltpBand,
  now: string
): Promise<void> {
  const { data: existing } = await admin
    .from('rcltp_student_journey')
    .select('id, current_band, progression_log, exercises_completed')
    .eq('learner_id', learnerId)
    .eq('dimension', 'overall')
    .maybeSingle();

  const changed = !existing || existing.current_band !== overallBand;
  const logEntry = { at: now, band: overallBand, changed };
  const log = Array.isArray(existing?.progression_log)
    ? [...existing!.progression_log, logEntry]
    : [logEntry];

  if (existing) {
    await admin
      .from('rcltp_student_journey')
      .update({
        current_band: overallBand,
        since: changed ? now : undefined,
        progression_log: log,
        updated_at: now,
      })
      .eq('id', existing.id);
  } else {
    await admin.from('rcltp_student_journey').insert({
      institution_id: institutionId,
      learner_id: learnerId,
      dimension: 'overall',
      current_band: overallBand,
      since: now,
      exercises_completed: 0,
      progression_log: log,
    });
  }
}
