// =============================================================================
// lib/services/pde-objective-marking.ts
// PDE Clinical Reasoning — server-side marks for mcq_warmup and image_tag
// =============================================================================
//
// The OSCE score route re-marks every objective answer here, against the
// answer key it reads with the service-role client. It never takes the
// `is_correct` / `region_score` the browser wrote into the answer envelope:
// the learner inserts pde_submissions.answers directly, so those fields are
// whatever the request said.
//
// The rules mirror what the learner was shown while answering:
//   mcq_warmup — fn_pde_mark_objective (supabase/migrations/pde_answer_key_secdef_rpcs.sql)
//   image_tag  — scoreRegions below, shared with /api/pde/clinical-reasoning/mark-image-tag
//                (hardened against a learner-reported image size; see scoreRegions)
// =============================================================================

import type { PdeAnswer, PdeQuestion } from '@/lib/services/pde-osce-scoring';

export interface ClickPoint {
  x: number;
  y: number;
  imgWidth: number;
  imgHeight: number;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  tolerance_px?: number;
}

// Regions are FRACTIONS of the natural image; the click arrives in natural
// pixels together with the image size the learner's browser reported. That
// size is learner-written, so nothing here may let it widen a region: the
// comparison runs in fraction space, and the pixel tolerance is converted with
// the reported size but CAPPED at the region's own width / height. Shrinking
// the reported image can therefore never stretch the tolerance past the region
// itself — `{x:0, y:0, imgWidth:0.001, imgHeight:0.001}` used to score 100.
//
// For an honest click (true image size, tolerance within the cap) the result
// is identical to the old pixel formula: 1 - distance / (2 x tolerance).
// With no usable tolerance_px (absent, 0, negative, non-finite) the tolerance
// is the region's half-width / half-height.
//
// Mirrored (without the cap) in fn_pde_score_clinical_answer's image_tag arm.
export function scoreRegions(
  pt: ClickPoint,
  regions: Region[] | null | undefined,
): { score: number; matched_label?: string } {
  if (!regions || regions.length === 0) {
    // No answer key → not markable in the learner's favour, same as an MCQ
    // with no correct option. Faculty must define a region.
    return { score: 0 };
  }
  const fx = pt.x / pt.imgWidth;
  const fy = pt.y / pt.imgHeight;
  let best = 0;
  let matched: string | undefined;
  for (const r of regions) {
    if (![r.x, r.y, r.w, r.h].every(isFiniteNumber) || r.w <= 0 || r.h <= 0) continue;
    const tolPx =
      isFiniteNumber(r.tolerance_px) && r.tolerance_px > 0 ? r.tolerance_px : null;
    const tx = tolPx === null ? r.w / 2 : Math.min(tolPx / pt.imgWidth, r.w);
    const ty = tolPx === null ? r.h / 2 : Math.min(tolPx / pt.imgHeight, r.h);
    const dx = (fx - (r.x + r.w / 2)) / tx;
    const dy = (fy - (r.y + r.h / 2)) / ty;
    const d = Math.sqrt(dx * dx + dy * dy);
    const s = Math.max(0, Math.min(100, (1 - d / 2) * 100));
    if (s > best) {
      best = s;
      matched = r.label;
    }
  }
  return { score: Math.round(best), matched_label: matched };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * `(elem->>'is_correct')::boolean IS TRUE`, as fn_pde_mark_objective reads it:
 * JSON true, and the text forms Postgres casts to true ('true', 't', 'yes',
 * 'y', 'on', '1', any case, trimmed) including the number 1. Postgres also
 * accepts unambiguous prefixes such as 'tr'; those are not mirrored.
 */
function pgBoolIsTrue(v: unknown): boolean {
  if (v === true || v === 1) return true;
  return (
    typeof v === 'string' &&
    ['true', 't', 'yes', 'y', 'on', '1'].includes(v.trim().toLowerCase())
  );
}

/** `elem->>'id'` / a text parameter: strings as-is, numbers as their text. */
function asIdText(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (isFiniteNumber(v)) return String(v);
  return null;
}

/** The answer-key columns of a pde_assessment_questions row. */
export interface ObjectiveAnswerKey {
  question_type: string | null;
  correct_answer: string | null;
  options: unknown;
  expected_regions: unknown;
}

/**
 * 0..100 for an mcq_warmup or image_tag answer, from the RAW choice the learner
 * made (selected_option_id / click_point) against the key. Undefined when the
 * envelope holds no choice at all (a skip) or the question is not one of these
 * two types — the caller then treats it as blank or as free text.
 */
export function markObjectiveAnswer(
  key: ObjectiveAnswerKey,
  envelope: Record<string, unknown>,
): number | undefined {
  if (key.question_type === 'mcq_warmup') {
    const picked = asIdText(envelope.selected_option_id);
    if (picked === null || picked.length === 0) return undefined;
    let correctId: string | null =
      typeof key.correct_answer === 'string' && key.correct_answer !== ''
        ? key.correct_answer
        : null;
    if (correctId === null && Array.isArray(key.options)) {
      const hit = key.options.find(
        (o) => o && typeof o === 'object' && pgBoolIsTrue((o as Record<string, unknown>).is_correct),
      ) as Record<string, unknown> | undefined;
      correctId = asIdText(hit?.id);
    }
    return correctId !== null && picked === correctId ? 100 : 0;
  }

  if (key.question_type === 'image_tag') {
    const cp = envelope.click_point as Record<string, unknown> | null | undefined;
    if (
      !cp ||
      !isFiniteNumber(cp.x) ||
      !isFiniteNumber(cp.y) ||
      !isFiniteNumber(cp.imgWidth) ||
      !isFiniteNumber(cp.imgHeight) ||
      cp.imgWidth <= 0 ||
      cp.imgHeight <= 0
    ) {
      return undefined;
    }
    const regions = Array.isArray(key.expected_regions)
      ? (key.expected_regions as Region[])
      : null;
    return scoreRegions(cp as unknown as ClickPoint, regions).score;
  }

  return undefined;
}

/**
 * Pair the stored answer envelopes with their questions BY question_id and give
 * each objective answer its server-side mark.
 *
 * `mapped` is readStoredAnswers(...).answers: one entry per OBJECT item of
 * `items`, in order, with q_number falling back to position. The attempt UI's
 * envelopes carry question_id but no q_number, so that position drifts after a
 * skipped question — the id is the only key that survives a skip. An envelope
 * with no known question_id keeps its positional entry and is counted.
 */
export function attachAnswersToQuestions(
  items: unknown[],
  mapped: PdeAnswer[],
  questions: PdeQuestion[],
  keysById: Map<string, ObjectiveAnswerKey>,
): { answers: PdeAnswer[]; positionalFallbacks: number } {
  const envelopes = items.filter(
    (i): i is Record<string, unknown> => !!i && typeof i === 'object',
  );
  const qNumberById = new Map(questions.map((q) => [q.id, q.q_number]));
  let positionalFallbacks = 0;

  const answers = mapped.map((a, idx): PdeAnswer => {
    const o = envelopes[idx] ?? {};
    const questionId = typeof o.question_id === 'string' ? o.question_id : null;
    const qNumber = questionId !== null ? qNumberById.get(questionId) : undefined;
    if (questionId === null || qNumber === undefined) {
      if (typeof o.q_number !== 'number') positionalFallbacks += 1;
      return a;
    }
    const key = keysById.get(questionId);
    const mark = key ? markObjectiveAnswer(key, o) : undefined;
    return mark === undefined
      ? { ...a, q_number: qNumber }
      : { ...a, q_number: qNumber, objective_score: mark };
  });

  return { answers, positionalFallbacks };
}
