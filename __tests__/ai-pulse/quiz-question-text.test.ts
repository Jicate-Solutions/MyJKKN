// __tests__/ai-pulse/quiz-question-text.test.ts
// ---------------------------------------------------------------------------
// Locks the display-layer strip that stops a learner seeing a question's
// number twice.
//
// Verified on production 2026-08-08, stored questions in
// startup_events.config->'quiz'->'questions' carry their number inside
// question_en/_ta in TWO forms — "Q1." … "Q5." (5 English + 5 Tamil) and
// "1." … "6." (6 English + 6 Tamil), ~22 prefixed strings in all. Both
// learner-facing surfaces number the list themselves, so the raw text rendered
// as "Q1  Q1. What can Gemini Live do...".
//
// The properties worth pinning are the ones a careless regex breaks:
//   • a question that merely STARTS with a Q-word is not truncated,
//   • prose opening on a bare number with no separator is not truncated,
//   • leading whitespace does not defeat the `^` anchor, and
//   • applying the strip twice is the same as applying it once, since both
//     surfaces call it on every render.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { stripLeadingQuestionNumber } from '@/lib/services/ai-pulse/quiz-question-text';

describe('stripLeadingQuestionNumber', () => {
  it('removes a "Q1." prefix', () => {
    expect(stripLeadingQuestionNumber('Q1. Foo')).toBe('Foo');
  });

  it('removes a two-digit "Q10)" prefix', () => {
    expect(stripLeadingQuestionNumber('Q10) Bar')).toBe('Bar');
  });

  it('removes a bare numeric prefix with no leading Q', () => {
    // The larger half of the production rows: 6 English + 6 Tamil are numbered
    // "1." … "6." with no Q at all, so the Q must be optional.
    expect(
      stripLeadingQuestionNumber(
        '1. What is the primary purpose of Gemini Canvas?',
      ),
    ).toBe('What is the primary purpose of Gemini Canvas?');
    expect(stripLeadingQuestionNumber('6. Flipped classroom')).toBe(
      'Flipped classroom',
    );
    expect(
      stripLeadingQuestionNumber('4. What is the "Vibe Coding" feature in'),
    ).toBe('What is the "Vibe Coding" feature in');
  });

  it('removes a bare numeric prefix from the Tamil twin', () => {
    // The Tamil questions number themselves with LATIN digits, so the same
    // pattern serves both languages — no separate Tamil-numeral branch.
    expect(
      stripLeadingQuestionNumber('1. Gemini Canvas-இன் முக்கிய நோக்கம் என்ன?'),
    ).toBe('Gemini Canvas-இன் முக்கிய நோக்கம் என்ன?');
  });

  it('strips through leading whitespace', () => {
    // The pattern is `^`-anchored, so the trim has to happen BEFORE the
    // replace. Trimming afterwards leaves the number visible on exactly this
    // input — and breaks idempotency for it.
    expect(stripLeadingQuestionNumber('  Q1. Foo')).toBe('Foo');
    expect(stripLeadingQuestionNumber('\nQ2. Bar')).toBe('Bar');
    expect(stripLeadingQuestionNumber('  1. Baz')).toBe('Baz');
  });

  it('leaves prose that opens on a bare number alone', () => {
    // No `.`/`)`/`:` straight after the digits, so this is not a number.
    expect(stripLeadingQuestionNumber('2026 was the year')).toBe(
      '2026 was the year',
    );
  });

  it('does strip a number-plus-separator opening, even in prose', () => {
    // Documented trade-off, not an oversight: "2026. What happened" is
    // indistinguishable from question number 2026, so it loses its opening.
    // Accepted because quizzes here run to 5–6 questions and no production
    // question takes this shape; capping the digit count would instead break
    // silently on a longer quiz.
    expect(stripLeadingQuestionNumber('2026. What happened')).toBe(
      'What happened',
    );
  });

  it('leaves an already-clean question unchanged', () => {
    expect(stripLeadingQuestionNumber('What can Gemini do?')).toBe(
      'What can Gemini do?',
    );
  });

  it('leaves a legitimate question starting with a Q-word alone', () => {
    // "Quick" begins with Q but has no number after it — truncating here would
    // eat real content.
    expect(stripLeadingQuestionNumber('Quick question about X')).toBe(
      'Quick question about X',
    );
  });

  it('is idempotent', () => {
    const once = stripLeadingQuestionNumber('Q1. Foo');
    expect(stripLeadingQuestionNumber(once)).toBe(once);
  });

  it('is idempotent for whitespace-led and bare-numeric input', () => {
    // These are the inputs that a trim-after-replace ordering gets wrong: the
    // first pass returns "Q1. Foo", the second returns "Foo".
    for (const input of ['  Q1. Foo', '\nQ2. Bar', '1. Flipped classroom']) {
      const once = stripLeadingQuestionNumber(input);
      expect(stripLeadingQuestionNumber(once)).toBe(once);
    }
  });

  it('strips the real production prefixes', () => {
    // Exact stored openings read from production on 2026-08-08.
    expect(
      stripLeadingQuestionNumber(
        'Q1. What can Gemini Live do that a normal text chat cannot?',
      ),
    ).toBe('What can Gemini Live do that a normal text chat cannot?');
    expect(
      stripLeadingQuestionNumber(
        'Q3. Gemini Omni is now available inside which Google app?',
      ),
    ).toBe('Gemini Omni is now available inside which Google app?');
  });

  it('keeps a stem that is only a number, rather than emptying it', () => {
    // The live panel filters out questions whose prompt is empty, and that
    // filter also feeds the score denominator. Emptying a degenerate stem here
    // would silently drop the question from scoring — out of scope for a
    // display fix.
    expect(stripLeadingQuestionNumber('Q1.')).toBe('Q1.');
    expect(stripLeadingQuestionNumber(stripLeadingQuestionNumber('Q1.'))).toBe(
      'Q1.',
    );
    // Same guarantee for the bare-numeric form, and through whitespace.
    expect(stripLeadingQuestionNumber('1.')).toBe('1.');
    expect(stripLeadingQuestionNumber('  1.  ')).toBe('1.');
  });

  it('handles a missing translation without throwing', () => {
    expect(stripLeadingQuestionNumber(null)).toBe('');
    expect(stripLeadingQuestionNumber(undefined)).toBe('');
    expect(stripLeadingQuestionNumber('')).toBe('');
  });
});
