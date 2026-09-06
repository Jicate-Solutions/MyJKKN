import { describe, it, expect } from 'vitest';
import {
  computeNarrativeEditStats,
  tokenizeNarrative,
  MAX_MEASURED_TOKENS,
} from '@/lib/services/accreditation/narrative-edit-distance';

// ---------------------------------------------------------------------------
// The metric's contract: 0 = accepted verbatim, 1 = fully rewritten, and the
// number in between matches the human sense of "how much did I change".
// Shapes mirror real drafter output: markdown prose with [E#] citations.
// ---------------------------------------------------------------------------

const DRAFT =
  'During AY 2026-27 the institution conducted 12 stakeholder satisfaction ' +
  'surveys [E1] and published the consolidated feedback report [E2].';

describe('tokenizeNarrative', () => {
  it('splits on whitespace runs and trims', () => {
    expect(tokenizeNarrative('  a  b\n\nc\t d ')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns [] for empty and non-string input', () => {
    expect(tokenizeNarrative('')).toEqual([]);
    expect(tokenizeNarrative('   \n ')).toEqual([]);
    expect(tokenizeNarrative(undefined as unknown as string)).toEqual([]);
    expect(tokenizeNarrative(null as unknown as string)).toEqual([]);
  });
});

describe('computeNarrativeEditStats', () => {
  it('verbatim acceptance measures 0 / 0', () => {
    const s = computeNarrativeEditStats(DRAFT, DRAFT);
    expect(s.editDistance).toBe(0);
    expect(s.editRatio).toBe(0);
  });

  it('reflowed whitespace is NOT an edit', () => {
    const reflowed = DRAFT.replace(/ /g, '\n  ');
    const s = computeNarrativeEditStats(DRAFT, reflowed);
    expect(s.editDistance).toBe(0);
    expect(s.editRatio).toBe(0);
  });

  it('one substituted word in ten is distance 1, ratio 0.1', () => {
    const draft = 'one two three four five six seven eight nine ten';
    const final = 'one two three four FIVE six seven eight nine ten';
    const s = computeNarrativeEditStats(draft, final);
    expect(s.editDistance).toBe(1);
    expect(s.editRatio).toBe(0.1);
  });

  it('deleting a citation marker counts as an edit', () => {
    const withMarker = 'enrolment rose to 4,857 [E1] this period';
    const without = 'enrolment rose to 4,857 this period';
    const s = computeNarrativeEditStats(withMarker, without);
    expect(s.editDistance).toBe(1);
    expect(s.draftTokenCount).toBe(7);
    expect(s.finalTokenCount).toBe(6);
  });

  it('appending a sentence counts its tokens as insertions', () => {
    const added = `${DRAFT} The response rate improved year on year.`;
    const s = computeNarrativeEditStats(DRAFT, added);
    expect(s.editDistance).toBe(7);
    expect(s.editRatio).toBeCloseTo(7 / s.finalTokenCount, 4);
  });

  it('a full rewrite reads as ratio 1', () => {
    const s = computeNarrativeEditStats(
      'alpha beta gamma delta',
      'entirely different words here now',
    );
    expect(s.editDistance).toBe(5); // 4 substitutions + 1 insertion
    expect(s.editRatio).toBe(1);
  });

  it('empty draft vs real text (and the reverse) is ratio 1', () => {
    const a = computeNarrativeEditStats('', 'some final text');
    expect(a.editDistance).toBe(3);
    expect(a.editRatio).toBe(1);
    const b = computeNarrativeEditStats('some draft text', '');
    expect(b.editDistance).toBe(3);
    expect(b.editRatio).toBe(1);
  });

  it('both sides empty is 0 / 0, never NaN', () => {
    const s = computeNarrativeEditStats('', '   ');
    expect(s.editDistance).toBe(0);
    expect(s.editRatio).toBe(0);
  });

  it('is symmetric (Levenshtein property)', () => {
    const a = computeNarrativeEditStats(DRAFT, 'a shorter human rewrite [E1]');
    const b = computeNarrativeEditStats('a shorter human rewrite [E1]', DRAFT);
    expect(a.editDistance).toBe(b.editDistance);
    expect(a.editRatio).toBe(b.editRatio);
  });

  it('rounds the ratio to 4 decimals', () => {
    // 1 edit over 3 tokens → 0.333333… → 0.3333
    const s = computeNarrativeEditStats('one two three', 'one two CHANGED');
    expect(s.editRatio).toBe(0.3333);
  });

  it('caps pathological inputs at MAX_MEASURED_TOKENS and stays consistent', () => {
    const huge = Array.from({ length: MAX_MEASURED_TOKENS + 500 }, (_, i) => `t${i}`).join(' ');
    const s = computeNarrativeEditStats(huge, '');
    expect(s.draftTokenCount).toBe(MAX_MEASURED_TOKENS);
    expect(s.editDistance).toBe(MAX_MEASURED_TOKENS);
    expect(s.editRatio).toBe(1);
  });
});
