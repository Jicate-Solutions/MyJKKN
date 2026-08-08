// ---------------------------------------------------------------------------
// AI Pulse — quiz question display text.
//
// Some authored questions carry their own number inside the stored text
// ("Q1. What can Gemini Live do that a normal text chat cannot?"). Verified on
// production 2026-08-08: 5 of 31 stored questions in
// startup_events.config.quiz begin that way. Every learner-facing surface adds
// its own number on top (the live panel via an <ol>, the preview dialog via a
// "Q{n}" label), so a learner reads the number twice.
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
 * A leading question number: `Q` (any case), an optional space, one or more
 * digits, then a `.`, `)` or `:` separator.
 *
 * Anchored and requiring a digit immediately after the optional space, so an
 * ordinary question that merely starts with a Q-word ("Quick question about
 * embeddings?") is left untouched.
 */
const LEADING_QUESTION_NUMBER = /^Q\s*\d+\s*[.):]\s*/i;

/**
 * Return `text` without a leading question number, trimmed.
 *
 * Strips at most one prefix, which makes it idempotent for real authored text:
 * once the number is gone the string no longer starts with one, so a second
 * application is a no-op.
 *
 * Text that carries no number is returned trimmed and otherwise unchanged.
 *
 * A degenerate stem that is ONLY a number ("Q1.") is returned as-is rather
 * than emptied. The live panel drops questions whose prompt is empty, and that
 * would also remove them from the score denominator — this module must not
 * change what counts, only how it reads.
 */
export function stripLeadingQuestionNumber(
  text: string | null | undefined,
): string {
  if (!text) return '';
  const stripped = text.replace(LEADING_QUESTION_NUMBER, '').trim();
  return stripped || text.trim();
}
