import { describe, it, expect } from 'vitest';
import { toAnswersArray } from '@/lib/pde/answers-shape';

// pde_submissions.answers arrives in two shapes. Everything below is a real
// shape the column can hold, not a hypothetical.

const ANSWER_A = { question_id: 'q1', is_correct: true, points_earned: 2 };
const ANSWER_B = { question_id: 'q2', is_correct: false, points_earned: 0 };

describe('toAnswersArray', () => {
  // (a) The pre-scoring shape — what every row in production held before the
  // OSCE write-back started landing.
  it('returns a plain array unchanged', () => {
    const raw = [ANSWER_A, ANSWER_B];
    expect(toAnswersArray(raw)).toEqual([ANSWER_A, ANSWER_B]);
    expect(toAnswersArray(raw)).toBe(raw);
  });

  it('returns an empty array unchanged', () => {
    expect(toAnswersArray([])).toEqual([]);
  });

  // (b) The post-scoring shape written by
  // app/api/pde/clinical-reasoning/score/route.ts — the one that broke readers.
  it('unwraps the scored { items, osce_score } object to its items', () => {
    const raw = {
      items: [ANSWER_A, ANSWER_B],
      osce_score: { percentage: 36, domain_scores: [{ domain: 'data_gathering', score: 2 }] },
    };
    expect(toAnswersArray(raw)).toEqual([ANSWER_A, ANSWER_B]);
  });

  it('unwraps a scored object whose items array is empty', () => {
    expect(toAnswersArray({ items: [], osce_score: { percentage: 0 } })).toEqual([]);
  });

  // (c) Absent values.
  it('returns [] for null and undefined', () => {
    expect(toAnswersArray(null)).toEqual([]);
    expect(toAnswersArray(undefined)).toEqual([]);
  });

  // (d) An object that is not the scored shape at all.
  it('returns [] for an object with no items key', () => {
    expect(toAnswersArray({ osce_score: { percentage: 36 } })).toEqual([]);
    expect(toAnswersArray({})).toEqual([]);
  });

  // (e) items present but not an array — must not be handed back as one.
  it('returns [] when items is not an array', () => {
    expect(toAnswersArray({ items: null })).toEqual([]);
    expect(toAnswersArray({ items: 'not-an-array' })).toEqual([]);
    expect(toAnswersArray({ items: 42 })).toEqual([]);
    expect(toAnswersArray({ items: { '0': ANSWER_A } })).toEqual([]);
  });

  it('returns [] for primitives', () => {
    expect(toAnswersArray('answers')).toEqual([]);
    expect(toAnswersArray(0)).toEqual([]);
    expect(toAnswersArray(false)).toEqual([]);
  });

  // The P0 itself: `sub.answers || []` did not fire on the object shape because
  // an object is truthy, so `for...of` threw a TypeError and took down the whole
  // Senior Learner dashboard. Every shape above must come back iterable.
  it('always returns something for...of can iterate', () => {
    const shapes: unknown[] = [
      [ANSWER_A],
      { items: [ANSWER_A], osce_score: { percentage: 36 } },
      { items: 'not-an-array' },
      { osce_score: {} },
      {},
      null,
      undefined,
      'answers',
    ];
    for (const raw of shapes) {
      expect(() => {
        for (const _entry of toAnswersArray(raw)) {
          // iteration itself is the assertion
        }
      }).not.toThrow();
    }
  });
});
