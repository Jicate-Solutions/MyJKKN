import { describe, it, expect } from 'vitest';
import {
  gradePartB,
  mapScoreToBand,
  computeComposite,
  PROVISIONAL_CUTOFFS,
  type BandCutoff,
  type PartBQuestion,
  type PartBResponse,
} from '@/lib/services/rcltp/scoring-engine';

// ---------------------------------------------------------------------------
// mapScoreToBand — provisional cutoffs 0-39 / 40-59 / 60-84 / 85-100
// Boundary tests at every edge (the values EKSAQ will later re-validate).
// ---------------------------------------------------------------------------
describe('mapScoreToBand (provisional fallback)', () => {
  const cases: [number, string][] = [
    [0, 'emergent'],
    [39, 'emergent'],
    [40, 'transitional'],
    [59, 'transitional'],
    [60, 'proficient'],
    [84, 'proficient'],
    [85, 'super_proficient'],
    [100, 'super_proficient'],
  ];
  it.each(cases)('score %i → %s', (score, band) => {
    expect(mapScoreToBand(score)).toBe(band);
  });

  it('returns null for a null score', () => {
    expect(mapScoreToBand(null)).toBeNull();
  });

  it('clamps out-of-range scores to the boundary bands', () => {
    expect(mapScoreToBand(-10)).toBe('emergent');
    expect(mapScoreToBand(150)).toBe('super_proficient');
  });

  it('honours per-tenant cutoffs over the provisional fallback', () => {
    // A tenant that makes "proficient" start at 50 instead of 60.
    const custom: BandCutoff[] = [
      { band: 'emergent', min_score: 0, max_score: 29 },
      { band: 'transitional', min_score: 30, max_score: 49 },
      { band: 'proficient', min_score: 50, max_score: 79 },
      { band: 'super_proficient', min_score: 80, max_score: 100 },
    ];
    expect(mapScoreToBand(55, custom)).toBe('proficient'); // would be 'emergent'→no; provisional 55='transitional'
    expect(mapScoreToBand(55)).toBe('transitional'); // fallback differs → proves override took effect
  });
});

// ---------------------------------------------------------------------------
// gradePartB — auto-grade MCQs (case/space-insensitive), % correct
// ---------------------------------------------------------------------------
describe('gradePartB', () => {
  const questions: PartBQuestion[] = [
    { id: 'q1', correct_answer: 'A', max_score: 1 },
    { id: 'q2', correct_answer: 'true', max_score: 1 },
    { id: 'q3', correct_answer: 'Paris', max_score: 2 }, // weighted question
  ];

  it('scores all-correct as 100%', () => {
    const responses: PartBResponse[] = [
      { id: 'r1', question_id: 'q1', response: 'A' },
      { id: 'r2', question_id: 'q2', response: 'true' },
      { id: 'r3', question_id: 'q3', response: 'Paris' },
    ];
    const out = gradePartB(responses, questions);
    expect(out.comprehensionScore).toBe(100);
    expect(out.graded.every((g) => g.is_correct)).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    const responses: PartBResponse[] = [
      { id: 'r1', question_id: 'q1', response: ' a ' },
      { id: 'r2', question_id: 'q2', response: 'TRUE' },
      { id: 'r3', question_id: 'q3', response: 'paris' },
    ];
    expect(gradePartB(responses, questions).comprehensionScore).toBe(100);
  });

  it('weights by max_score (q3 worth 2 of 4 total points)', () => {
    // q1 wrong (1pt lost), q2 correct (1), q3 correct (2) → 3/4 = 75%
    const responses: PartBResponse[] = [
      { id: 'r1', question_id: 'q1', response: 'B' },
      { id: 'r2', question_id: 'q2', response: 'true' },
      { id: 'r3', question_id: 'q3', response: 'Paris' },
    ];
    expect(gradePartB(responses, questions).comprehensionScore).toBe(75);
  });

  it('excludes ungradable (blank correct_answer / open-ended) questions from totals', () => {
    const qs: PartBQuestion[] = [
      { id: 'q1', correct_answer: 'A', max_score: 1 },
      { id: 'open', correct_answer: null, max_score: 5 }, // open-ended, not auto-gradable
    ];
    const responses: PartBResponse[] = [
      { id: 'r1', question_id: 'q1', response: 'A' },
      { id: 'r2', question_id: 'open', response: 'a thoughtful paragraph' },
    ];
    const out = gradePartB(responses, qs);
    // only q1 counts → 1/1 = 100%; the open-ended item is recorded 0/not-correct but excluded
    expect(out.comprehensionScore).toBe(100);
    expect(out.graded.find((g) => g.id === 'r2')).toEqual({ id: 'r2', is_correct: false, score: 0 });
  });

  it('returns null comprehension when there are no gradable questions', () => {
    expect(gradePartB([], questions).comprehensionScore).toBeNull();
  });

  it('credits a correct stretch (bonus) item but excludes it from the denominator', () => {
    // 1 core (correct, max 1) + 1 stretch (correct, max 1): 2 earned / 1 core-denominator
    // → 200%, clamped to 100. A struggling reader is lifted, never past 100.
    const qs: PartBQuestion[] = [
      { id: 'core', correct_answer: 'A', max_score: 1 },
      { id: 'stretch', correct_answer: 'B', max_score: 1, is_stretch: true },
    ];
    const responses: PartBResponse[] = [
      { id: 'r1', question_id: 'core', response: 'A' },
      { id: 'r2', question_id: 'stretch', response: 'B' },
    ];
    expect(gradePartB(responses, qs).comprehensionScore).toBe(100);
  });

  it('never penalises a wrong stretch item (0 added to both numerator and denominator)', () => {
    // 1 core (correct, max 1) + 1 stretch (wrong): 1 earned / 1 core-denominator = 100%.
    const qs: PartBQuestion[] = [
      { id: 'core', correct_answer: 'A', max_score: 1 },
      { id: 'stretch', correct_answer: 'B', max_score: 1, is_stretch: true },
    ];
    const responses: PartBResponse[] = [
      { id: 'r1', question_id: 'core', response: 'A' },
      { id: 'r2', question_id: 'stretch', response: 'definitely wrong' },
    ];
    expect(gradePartB(responses, qs).comprehensionScore).toBe(100);
  });

  it('never marks a blank response correct', () => {
    const responses: PartBResponse[] = [{ id: 'r1', question_id: 'q1', response: null }];
    const out = gradePartB(responses, questions);
    expect(out.comprehensionScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeComposite — 0.5/0.5 when both, single-dimension fallback, null when neither
// ---------------------------------------------------------------------------
describe('computeComposite (0.5 reading + 0.5 comprehension, provisional)', () => {
  it('averages both dimensions', () => {
    expect(computeComposite(80, 60)).toBe(70);
    expect(computeComposite(67, 85)).toBe(76); // the spec 67→85 example → 76
  });

  it('falls back to the single present dimension (consent-driven Part-B-only)', () => {
    expect(computeComposite(null, 72)).toBe(72);
    expect(computeComposite(50, null)).toBe(50);
  });

  it('returns null when neither dimension is present', () => {
    expect(computeComposite(null, null)).toBeNull();
  });

  it('maps a mixed composite to the right band end-to-end', () => {
    const overall = computeComposite(80, 60); // 70
    expect(mapScoreToBand(overall)).toBe('proficient');
  });
});

// sanity: the provisional cutoffs are contiguous 0..100 with no gaps/overlaps
describe('PROVISIONAL_CUTOFFS integrity', () => {
  it('tiles 0..100 with no gap or overlap', () => {
    const sorted = [...PROVISIONAL_CUTOFFS].sort((a, b) => a.min - b.min);
    expect(sorted[0].min).toBe(0);
    expect(sorted[sorted.length - 1].max).toBe(100);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].min).toBe(sorted[i - 1].max + 1);
    }
  });
});
