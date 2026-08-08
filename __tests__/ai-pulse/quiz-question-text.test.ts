// __tests__/ai-pulse/quiz-question-text.test.ts
// ---------------------------------------------------------------------------
// Locks the display-layer strip that stops a learner seeing a question's
// number twice.
//
// Verified on production 2026-08-08: 5 of 31 stored questions in
// startup_events.config.quiz carry their number inside question_en/_ta
// ("Q1. What can Gemini Live do that a normal text chat cannot?"). Both
// learner-facing surfaces number the list themselves, so the raw text rendered
// as "Q1  Q1. What can Gemini Live do...".
//
// The two properties worth pinning are the ones a careless regex breaks:
//   • a question that merely STARTS with a Q-word is not truncated, and
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
  });

  it('handles a missing translation without throwing', () => {
    expect(stripLeadingQuestionNumber(null)).toBe('');
    expect(stripLeadingQuestionNumber(undefined)).toBe('');
    expect(stripLeadingQuestionNumber('')).toBe('');
  });
});
