// app/(routes)/health/admin/programs/_components/quiz-helpers.ts
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// Local factory + validation helpers for the per-day QuizSpec editor.
// QuizSpec shape lives in the spine (@/types/health-programs) — single-language,
// simpler than the bilingual AI Pulse quiz. We mirror the editor UX, not the shape.

import type { QuizOption, QuizQuestion, QuizSpec } from '@/types/health-programs';

function genId(prefix: string): string {
  // crypto.randomUUID is available in modern browsers; fall back for safety.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeBlankOption(isCorrect = false): QuizOption {
  return { id: genId('opt'), text: '', is_correct: isCorrect };
}

export function makeBlankQuestion(): QuizQuestion {
  return {
    id: genId('q'),
    question: '',
    // Seed with 2 options; first marked correct by default so a fresh question
    // is already valid once text is filled in.
    options: [makeBlankOption(true), makeBlankOption(false)],
  };
}

export function emptyQuiz(): QuizSpec {
  return { questions: [] };
}

export interface QuizValidation {
  ok: boolean;
  errors: string[];
}

/** Validates a quiz. An EMPTY quiz is valid — the day quiz is optional. */
export function validateQuiz(quiz: QuizSpec): QuizValidation {
  const errors: string[] = [];
  quiz.questions.forEach((q, i) => {
    const tag = `Q${i + 1}`;
    if (!q.question.trim()) errors.push(`${tag}: question text is empty.`);
    if (q.options.length < 2) errors.push(`${tag}: needs at least 2 options.`);
    const correctCount = q.options.filter((o) => o.is_correct).length;
    if (correctCount === 0) errors.push(`${tag}: pick a correct answer.`);
    if (correctCount > 1) errors.push(`${tag}: only one answer can be correct.`);
    q.options.forEach((o, oi) => {
      if (!o.text.trim()) {
        errors.push(`${tag} option ${String.fromCharCode(65 + oi)}: text is empty.`);
      }
    });
  });
  return { ok: errors.length === 0, errors };
}

/** True when the quiz has at least one fully-authored question. */
export function quizHasContent(quiz: QuizSpec | null | undefined): boolean {
  return !!quiz && quiz.questions.length > 0;
}
