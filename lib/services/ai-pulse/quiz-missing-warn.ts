// =====================================================================
// AI Pulse — "this cycle has no quiz" detection, as pure functions
// =====================================================================
// Created: 2026-09-17.
//
// WHY THIS IS A MODULE AND NOT INLINE IN THE ROUTE
//   A Next.js route file may only export its handlers and route config, so
//   nothing inside one can be driven by a test with a fixture. The judgement
//   this guard makes — WHERE the quiz lives in the config, and what counts as
//   missing — is precisely the part that can be silently wrong forever, so it
//   lives here where __tests__/lib/ai-pulse/quiz-missing-warn.test.ts can run
//   it against the real production config shapes.
//
// THE ONE FACT EVERYTHING HANGS ON
//   The quiz is a SIBLING of the ai_pulse key at the TOP level of
//   startup_events.config:
//
//       config = { kind: 'ai_pulse', ai_pulse: {...}, quiz: {...} }
//
//   NOT config.ai_pulse.quiz. Read off production 2026-09-17: the cycles that
//   worked (2026-09-10, 2026-09-03) carry top-level keys {ai_pulse, kind, quiz}
//   and the one that ran with zero quiz-takers (2026-09-17) carries only
//   {ai_pulse, kind}. lib/services/ai-pulse/quiz-service.ts writes it there
//   (`{ ...currentConfig, quiz: nextPayload }`) and reads it from there.
//
//   Point this at config.ai_pulse.quiz instead and the check flags EVERY cycle
//   forever, which is the same as flagging none.

/** The permission that says "you can author this cycle's quiz". */
export const QUIZ_AUTHOR_PERMISSION = 'aiPulse:quiz.author';

/** ai_pulse_policies keys. Both carry code defaults so the route is correct
 *  before the seed migration is applied. */
export const WARN_ENABLED_KEY = 'quiz_missing_warning_enabled';
export const WARN_DAYS_KEY = 'quiz_missing_warning_days';

/**
 * How many days ahead of a session a missing quiz starts being reported.
 *
 * 3 is the Director-facing default and is deliberately short of the ~7 days
 * the two working cycles were actually authored at: a warning that starts a
 * full week out competes with the previous cycle still being live, and the
 * point is a signal someone acts on, not one they learn to scroll past.
 */
export const DEFAULT_WARN_DAYS = 3;

/** Upper bound on the configurable window. A typo of 300 in the policy row
 *  would flag every cycle in the read window and turn the alert into noise. */
export const MAX_WARN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type QuizGapReason = 'no_quiz_key' | 'no_questions' | null;

/**
 * Today's date in IST as a YYYY-MM-DD key.
 *
 * The comparison has to happen in IST, not UTC: a session on the 18th is
 * "tomorrow" to a human in Salem from 05:30 IST on the 17th, while UTC still
 * reads the 16th for another five and a half hours. en-CA is used because it
 * formats as ISO-8601, which is the thing being compared.
 */
export function istDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Whole days from `from` to `to`, both YYYY-MM-DD keys. Returns null when
 * either side is not a date key — a caller must not silently treat an
 * unparseable date as "zero days away", which would flag it.
 *
 * Both keys parse as UTC midnight, so the difference is always an exact
 * integer number of days and no DST or offset can shift it.
 */
export function daysBetweenDateKeys(from: string, to: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

/**
 * Does this cycle's config carry a usable quiz?
 *
 * Two ways it does not, and they are reported separately because they mean
 * different things to whoever reads the notification: nobody has opened the
 * editor at all, versus somebody opened it and saved an empty one.
 *
 * Note what is deliberately NOT judged here: a quiz with questions that have
 * no correct option, or thresholds a blind respondent could clear. Those are
 * quiz-INTEGRITY concerns and lib/services/ai-pulse/quiz-integrity.ts already
 * refuses them at save time. This module answers one question only — is there
 * a quiz at all — and the PR body says so rather than implying wider cover.
 */
export function quizGapReason(config: unknown): {
  reason: QuizGapReason;
  questionCount: number;
} {
  const cfg = (config ?? {}) as Record<string, unknown>;
  const quiz = cfg.quiz;
  if (!quiz || typeof quiz !== 'object' || Array.isArray(quiz)) {
    return { reason: 'no_quiz_key', questionCount: 0 };
  }
  const questions = (quiz as Record<string, unknown>).questions;
  const count = Array.isArray(questions) ? questions.length : 0;
  if (count === 0) return { reason: 'no_questions', questionCount: 0 };
  return { reason: null, questionCount: count };
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * "17 Sep 2026" — the form a human reads in a bell card.
 *
 * Deliberately a lookup and not Intl: `Intl.DateTimeFormat('en-GB', { month:
 * 'short' })` renders September as "Sept" on the ICU that ships with Node 22,
 * and as "Sep" on others. Notification copy that changes with the runtime's
 * ICU version is not worth the import, and a test pinned to one of them breaks
 * on the other.
 */
export function prettyDay(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  const at = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(at)) return dateKey;
  const d = new Date(at);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function whenPhrase(daysOut: number): string {
  if (daysOut <= 0) return 'is today';
  if (daysOut === 1) return 'is tomorrow';
  return `is in ${daysOut} days`;
}

export function warnTitle(demoDay: string, daysOut: number): string {
  if (daysOut <= 0) return `No quiz for tonight's AI Pulse session`;
  return `No quiz yet for the AI Pulse session on ${prettyDay(demoDay)}`;
}

/**
 * The body text.
 *
 * It names the consequence with the real number rather than describing the
 * rule, because the rule is what everyone already agreed to and the number is
 * what makes someone open the editor: on 17 Sep 2026, 437 people attended and
 * not one answered a quiz question, against 198 and 195 the two weeks before.
 */
export function warnBody(
  demoDay: string,
  daysOut: number,
  reason: QuizGapReason,
  questionCount: number,
): string {
  const gap =
    reason === 'no_questions'
      ? 'a quiz was started but it has no questions in it'
      : 'no quiz has been authored for it';
  const head = `The AI Pulse session on ${prettyDay(demoDay)} ${whenPhrase(daysOut)} and ${gap}.`;
  const cost =
    'The last cycle that ran without one had 437 people attend and nobody answered a single question.';
  const call = 'Open the quiz editor to add questions before the session.';
  const counted = questionCount > 0 ? ` (${questionCount} found)` : '';
  return `${head}${counted} ${cost} ${call}`;
}
