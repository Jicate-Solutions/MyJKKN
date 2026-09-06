// ---------------------------------------------------------------------------
// AI Pulse — quiz question display text.
//
// Some authored questions carry their own number inside the stored text
// ("Q1. What can Gemini Live do that a normal text chat cannot?"). Every
// learner-facing surface adds its own number on top (the live panel via an
// <ol>, the preview dialog via a "Q{n}" label), so a learner reads the number
// twice.
//
// Verified on production 2026-08-08 across startup_events.config->'quiz'->
// 'questions', the prefix is authored in TWO forms:
//   • "Q1." … "Q5."  — 5 English + 5 Tamil
//   • "1."  … "6."   — 6 English + 6 Tamil  (no leading Q)
// ~22 prefixed strings in total. The Tamil twins number themselves with LATIN
// digits ("1. Gemini Canvas-இன் …"), so one pattern covers both languages.
//
// The fix lives here, at the DISPLAY layer, not in the stored JSONB. A one-off
// UPDATE keyed to production rows would have to live in supabase/migrations/,
// where it re-runs on every replay — the exact shape that has drawn repeated
// HIGH review findings in this repo. Stripping on read costs nothing, is safe
// on data that was authored correctly, and leaves the stored text intact for
// the authoring console to repair deliberately.
//
// This module is pure. No I/O, no Supabase, no React — so it can be called
// from a client component and from a test.
// ---------------------------------------------------------------------------

/**
 * A leading question number: an OPTIONAL `Q` (any case), an optional space, one
 * or more digits, then a `.`, `)` or `:` separator.
 *
 * The `Q` is optional because production stores both forms ("Q1. …" and
 * "1. …"). The digits and the separator are not: requiring a digit means an
 * ordinary question that merely starts with a Q-word ("Quick question about
 * embeddings?") is left untouched, and requiring the separator means prose that
 * opens on a bare number ("2026 was the year …") is left untouched too.
 *
 * The one string this cannot tell apart is prose that opens with a number AND a
 * separator — "2026. What happened" is stripped to "What happened", because it
 * is indistinguishable from question number 2026. Accepted: quizzes here run to
 * 5–6 questions, and the alternative (capping the digit count) would silently
 * stop working on a longer quiz. No quiz question in production takes that
 * shape.
 */
const LEADING_QUESTION_NUMBER = /^Q?\s*\d+\s*[.):]\s*/i;

/**
 * Return `text` without a leading question number, trimmed.
 *
 * Strips at most one prefix, which makes it idempotent: once the number is gone
 * the string no longer starts with one, so a second application is a no-op.
 *
 * The trim happens BEFORE the replace, not after. The pattern is `^`-anchored,
 * so running it against an untrimmed string cannot match past leading
 * whitespace — "  Q1. Foo" would keep its number, and idempotency would fail
 * for exactly that input. No production question currently opens on whitespace,
 * so this is latent rather than live, but both surfaces call this on every
 * render and the ordering is free to get right.
 *
 * Text that carries no number is returned trimmed and otherwise unchanged.
 *
 * A degenerate stem that is ONLY a number ("Q1." or "1.") is returned as-is
 * rather than emptied. The live panel drops questions whose prompt is empty, and that
 * would also remove them from the score denominator — this module must not
 * change what counts, only how it reads.
 */
export function stripLeadingQuestionNumber(
  text: string | null | undefined,
): string {
  if (!text) return '';
  const trimmed = text.trim();
  const stripped = trimmed.replace(LEADING_QUESTION_NUMBER, '').trim();
  return stripped || trimmed;
}
