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

// Ported verbatim from the former client-side localFallbackScore so scoring is
// unchanged, only relocated server-side. Regions are FRACTIONS of the natural
// image dimensions; the click arrives in natural pixels.
export function scoreRegions(
  pt: ClickPoint,
  regions: Region[] | null | undefined,
): { score: number; matched_label?: string } {
  if (!regions || regions.length === 0) {
    // No expected regions defined → award full credit (faculty must define).
    return { score: 100 };
  }
  let best = 0;
  let matched: string | undefined;
  for (const r of regions) {
    const rw = r.w * pt.imgWidth;
    const rh = r.h * pt.imgHeight;
    const cx = r.x * pt.imgWidth + rw / 2;
    const cy = r.y * pt.imgHeight + rh / 2;
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const tol = r.tolerance_px ?? Math.max(rw, rh) / 2;
    const s = Math.max(0, Math.min(100, (1 - dist / (tol * 2)) * 100));
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
    const picked = envelope.selected_option_id;
    if (typeof picked !== 'string' || picked.length === 0) return undefined;
    let correctId: string | null =
      typeof key.correct_answer === 'string' && key.correct_answer !== ''
        ? key.correct_answer
        : null;
    if (correctId === null && Array.isArray(key.options)) {
      const hit = key.options.find(
        (o) => o && typeof o === 'object' && (o as Record<string, unknown>).is_correct === true,
      ) as Record<string, unknown> | undefined;
      correctId = typeof hit?.id === 'string' ? hit.id : null;
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
