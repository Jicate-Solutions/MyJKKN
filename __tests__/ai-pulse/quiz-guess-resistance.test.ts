// __tests__/ai-pulse/quiz-guess-resistance.test.ts
// ---------------------------------------------------------------------------
// Locks Director decision #10 (2026-07-30): a NEW AI Pulse cycle starts at a
// 50% live pass threshold, so picking one option letter throughout no longer
// reaches a pass.
//
// The 2026-07-30 cycle is the worked example. Its answer key, read live from
// startup_events.config.quiz at decision time, was B, C, A, D, B — top slot
// share 2/5 = 0.400. Under the old 40% threshold a respondent who answered "B"
// five times scored exactly 40 and, because the panel passes on
// `score >= threshold`, PASSED with no knowledge at all.
//
// These tests also pin two boundary facts that are easy to assume wrongly:
//   • 0.400 does NOT trip the advisory warning (WARN_SLOT_SHARE uses strict >),
//   • a key at exactly MAX_SLOT_SHARE is still permitted, and a blind
//     respondent scores exactly 50 there — which still reaches a 50% pass.
// Both are recorded as-is; the integrity constants were explicitly out of
// scope for decision #10.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  checkQuizIntegrity,
  MAX_SLOT_SHARE,
  WARN_SLOT_SHARE,
} from '@/lib/services/ai-pulse/quiz-integrity';
import { DEFAULT_QUIZ, type QuizQuestion } from '@/lib/services/ai-pulse/quiz-service';

/** Build a well-formed question whose correct answer sits in `correctSlot`. */
function question(id: string, correctSlot: number, optionCount = 4): QuizQuestion {
  return {
    id,
    question_en: `Question ${id}`,
    question_ta: `கேள்வி ${id}`,
    options: Array.from({ length: optionCount }, (_, i) => ({
      id: `${id}-opt${i}`,
      text_en: `Option ${String.fromCharCode(65 + i)}`,
      text_ta: `விருப்பம் ${String.fromCharCode(65 + i)}`,
      is_correct: i === correctSlot,
    })),
  };
}

/** Slot index for each answer letter. A=0, B=1, C=2, D=3. */
const SLOT: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

function keyFromLetters(letters: string[], optionCount = 4): QuizQuestion[] {
  return letters.map((letter, i) => question(`q${i + 1}`, SLOT[letter], optionCount));
}

/**
 * Score a respondent who answers the same option slot on every question.
 * Mirrors computeScore in app/(routes)/ai-pulse/live/[cycle]/_components/
 * quiz-panel.tsx: correct / scoreable, rounded to a whole percent.
 */
function blindScore(questions: QuizQuestion[], alwaysSlot: number): number {
  const correct = questions.filter((q) => q.options[alwaysSlot]?.is_correct).length;
  return Math.round((correct / questions.length) * 100);
}

/** Mirrors the panel's pass test: `score >= passThreshold`. */
function passes(score: number, threshold: number): boolean {
  return score >= threshold;
}

// The answer key measured on the 2026-07-30 cycle.
const KEY_2026_07_30 = ['B', 'C', 'A', 'D', 'B'];

describe('AI Pulse quiz — default live pass threshold (decision #10)', () => {
  it('seeds a new cycle at 50% live', () => {
    expect(DEFAULT_QUIZ.pass_threshold_live).toBe(50);
  });

  it('leaves the async make-up threshold at 60%', () => {
    expect(DEFAULT_QUIZ.pass_threshold_async).toBe(60);
  });

  it('starts a new cycle with no questions and publication off', () => {
    expect(DEFAULT_QUIZ.questions).toEqual([]);
    expect(DEFAULT_QUIZ.schedule_publication).toBe(false);
  });
});

describe('AI Pulse quiz — one-letter respondent on the 2026-07-30 key', () => {
  const questions = keyFromLetters(KEY_2026_07_30);

  it('scores 40% by always answering B', () => {
    expect(blindScore(questions, SLOT.B)).toBe(40);
  });

  it('passed under the old 40% threshold — the defect decision #10 closes', () => {
    expect(passes(blindScore(questions, SLOT.B), 40)).toBe(true);
  });

  it('fails under the new 50% default', () => {
    expect(passes(blindScore(questions, SLOT.B), DEFAULT_QUIZ.pass_threshold_live)).toBe(
      false,
    );
  });

  it('fails at 50% for every other single-letter choice too', () => {
    for (const slot of [SLOT.A, SLOT.B, SLOT.C, SLOT.D]) {
      const score = blindScore(questions, slot);
      expect(score).toBeLessThan(DEFAULT_QUIZ.pass_threshold_live);
    }
  });

  it('still passes someone who got 3 of 5 right', () => {
    const score = Math.round((3 / 5) * 100);
    expect(score).toBe(60);
    expect(passes(score, DEFAULT_QUIZ.pass_threshold_live)).toBe(true);
  });
});

describe('AI Pulse quiz — answer-key integrity report reaches the author', () => {
  it('accepts the 2026-07-30 key with no blocking error', () => {
    const report = checkQuizIntegrity(KEY_2026_07_30.length ? keyFromLetters(KEY_2026_07_30) : [], 50);
    expect(report.errors).toEqual([]);
  });

  it('does NOT warn at a 0.400 share — WARN_SLOT_SHARE compares strictly', () => {
    // 2/5 = 0.400, and the check is `share > WARN_SLOT_SHARE`. Pinned so a
    // later reader does not assume the 2026-07-30 key produced a warning.
    const report = checkQuizIntegrity(keyFromLetters(KEY_2026_07_30), 50);
    expect(2 / 5).toBe(WARN_SLOT_SHARE);
    expect(report.warnings).toEqual([]);
  });

  it('warns when the top slot is above 0.4 but within the hard limit', () => {
    // 3 of 6 = 0.500 = exactly MAX_SLOT_SHARE, which is permitted.
    const report = checkQuizIntegrity(keyFromLetters(['C', 'C', 'C', 'A', 'B', 'D']), 50);
    expect(report.errors).toEqual([]);
    expect(report.warnings.length).toBe(1);
    expect(report.warnings[0]).toContain('Option C');
  });

  it('records that a key at exactly MAX_SLOT_SHARE still reaches a 50% pass', () => {
    // Honest boundary note, not an endorsement: decision #10 explicitly left
    // MAX_SLOT_SHARE alone, so this residual case survives the change.
    const questions = keyFromLetters(['C', 'C', 'C', 'A', 'B', 'D']);
    expect(blindScore(questions, SLOT.C)).toBe(50);
    expect(passes(50, DEFAULT_QUIZ.pass_threshold_live)).toBe(true);
    expect(3 / 6).toBe(MAX_SLOT_SHARE);
  });

  it('blocks the 2026-07-09 key that started all of this (C correct 5 of 6)', () => {
    const report = checkQuizIntegrity(keyFromLetters(['C', 'C', 'C', 'C', 'C', 'A']), 50);
    expect(report.errors.length).toBe(1);
    expect(report.errors[0]).toContain('positionally biased');
    expect(report.errors[0]).toContain('50% pass mark');
  });

  it('skips the positional check on a quiz too short to judge', () => {
    const report = checkQuizIntegrity(keyFromLetters(['A', 'A', 'A']), 50);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });
});
