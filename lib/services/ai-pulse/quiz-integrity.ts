// ---------------------------------------------------------------------------
// AI Pulse — quiz integrity checks.
//
// Authored after the 2026-07-09 cycle shipped a quiz whose correct answer sat
// in option slot C for FIVE of six questions. Answering "C" six times with no
// knowledge scored 5/6 = 83.3% against a 40% pass mark. Every structural check
// in place at the time passed: four options each, exactly one `is_correct`, no
// blanks. Shape validation certifies an empty form.
//
// Worse, that quiz also contained an unanswerable question (its stem asked one
// thing; all four options answered another). An honest learner therefore also
// scored 5/6 = 83.3 -- missing the broken item instead of the odd one out. The
// two defects made each other undetectable: no per-question answers are stored
// anywhere, so a blind respondent and a perfect one are indistinguishable in
// the data. We cannot detect the second defect from structure. We CAN refuse to
// ship the first.
//
// This module is pure. No I/O, no Supabase, no React -- so it can be called
// from the authoring service, from the AI-suggest route, and from a test.
// ---------------------------------------------------------------------------

import type { QuizQuestion } from './quiz-service';

/** Option slot labels, positional. Index 0 => 'A'. */
const SLOT = 'ABCDEFGH';

/**
 * A single constant answer must never be worth this share of the paper.
 * At 50% a guesser still fails any pass mark above 50, and a legitimately
 * balanced short quiz (e.g. 4 questions, 2 correct in slot B) still ships.
 */
export const MAX_SLOT_SHARE = 0.5;

/** Below the hard limit but worth telling the author about. */
export const WARN_SLOT_SHARE = 0.4;

/** Positional bias is meaningless on a 1-3 question quiz. */
const MIN_QUESTIONS_FOR_SLOT_CHECK = 4;

export interface QuizIntegrityReport {
  /** Blocking. The quiz must not be saved. */
  errors: string[];
  /** Non-blocking. Surface to the author. */
  warnings: string[];
  /** Per-slot count of correct answers, by option index. */
  slotCounts: number[];
}

function blank(s: unknown): boolean {
  return typeof s !== 'string' || s.trim().length === 0;
}

/**
 * Structural + exploitability checks on a quiz's questions.
 *
 * `blindPassThreshold` is the live pass mark as a percentage (e.g. 50). It is
 * used only to explain the failure in the error message -- the hard limit is
 * MAX_SLOT_SHARE regardless, because the pass mark can be lowered later while
 * the quiz stays on file. The fallback tracks DEFAULT_QUIZ.pass_threshold_live
 * (50 since 2026-07-30, decision #10) so an unparameterised call never quotes a
 * pass mark the platform no longer uses. Every real caller passes the actual
 * value, so this default is explanatory only.
 */
export function checkQuizIntegrity(
  questions: QuizQuestion[],
  blindPassThreshold = 50,
): QuizIntegrityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const slotCounts: number[] = [];

  if (!Array.isArray(questions) || questions.length === 0) {
    return { errors, warnings, slotCounts };
  }

  questions.forEach((q, qi) => {
    const n = qi + 1;
    const options = Array.isArray(q?.options) ? q.options : [];

    if (options.length < 2) {
      errors.push(`Q${n}: needs at least 2 options (has ${options.length}).`);
      return;
    }
    if (blank(q?.question_en)) {
      errors.push(`Q${n}: the English question text is empty.`);
    }

    const correctIdx: number[] = [];
    options.forEach((o, oi) => {
      if (o?.is_correct === true) correctIdx.push(oi);
      if (blank(o?.text_en)) {
        errors.push(`Q${n}, option ${SLOT[oi] ?? oi + 1}: the English text is empty.`);
      }
    });

    if (correctIdx.length !== 1) {
      errors.push(
        `Q${n}: exactly one option must be correct (found ${correctIdx.length}).`,
      );
      return;
    }

    const slot = correctIdx[0];
    slotCounts[slot] = (slotCounts[slot] ?? 0) + 1;
  });

  // Positional-bias check. Runs only when every question contributed a slot --
  // otherwise the counts are incomplete and the share is meaningless.
  const counted = slotCounts.reduce((a, b) => a + (b ?? 0), 0);
  if (counted === questions.length && questions.length >= MIN_QUESTIONS_FOR_SLOT_CHECK) {
    let topSlot = 0;
    let topCount = 0;
    slotCounts.forEach((c, i) => {
      if ((c ?? 0) > topCount) {
        topCount = c ?? 0;
        topSlot = i;
      }
    });
    const share = topCount / questions.length;
    const pct = Math.round(share * 1000) / 10;

    if (share > MAX_SLOT_SHARE) {
      errors.push(
        `Answer key is positionally biased: option ${SLOT[topSlot]} is correct in ` +
          `${topCount} of ${questions.length} questions (${pct}%). ` +
          `Someone who always picks ${SLOT[topSlot]} scores ${pct}% with no knowledge, ` +
          `against a ${blindPassThreshold}% pass mark. Shuffle the correct answers.`,
      );
    } else if (share > WARN_SLOT_SHARE) {
      warnings.push(
        `Option ${SLOT[topSlot]} is correct in ${topCount} of ${questions.length} ` +
          `questions (${pct}%). Consider shuffling for a flatter key.`,
      );
    }
  }

  return { errors, warnings, slotCounts };
}

/** Convenience: throws with every blocking reason at once. */
export function assertQuizIntegrity(
  questions: QuizQuestion[],
  blindPassThreshold = 50,
): QuizIntegrityReport {
  const report = checkQuizIntegrity(questions, blindPassThreshold);
  if (report.errors.length > 0) {
    throw new Error(`Quiz cannot be saved:\n• ${report.errors.join('\n• ')}`);
  }
  return report;
}
