// =====================================================================
// HR Appraisal — three-rating model (T5.1)
// =====================================================================
// This module decides what reaches the promotion rule, so the arithmetic
// and the refusals are pinned here rather than trusted.
//
// Covers:
//   1. All four areas are rated at every college (no per-college switch).
//   2. Score anchors: all Meets = 50, all Exceeds = 100, all Below = 0.
//   3. An incomplete appraisal yields null, never a number.
//   4. Legacy 1-10 payloads parse to "not rated", not to a rating.
//   5. Policy point overrides apply; a flat scale cannot invent a spread.
//   6. The Collegiality safeguard fires only on Below, and can be turned off.
// =====================================================================

import { describe, it, expect } from 'vitest';
import {
  APPRAISAL_AREAS,
  DEFAULT_RATING_POINTS,
  collegialityExampleMissing,
  collegialityExampleRequired,
  deriveAppraisalScore,
  hasBelow,
  isComplete,
  missingAreas,
  parseCollegialityExample,
  parseRatings,
  resolveAreas,
  resolveRatingPoints,
  summariseRatings,
  type AppraisalRatingMap,
} from '@/lib/hr/appraisal-ratings';

const AREAS = resolveAreas();
const all = (r: 'exceeds' | 'meets' | 'below'): AppraisalRatingMap =>
  Object.fromEntries(AREAS.map((a) => [a, r])) as AppraisalRatingMap;

describe('areas', () => {
  it('rates all four areas, collegiality included, for everyone', () => {
    expect(AREAS).toEqual(['teaching', 'research', 'service', 'collegiality']);
    expect(APPRAISAL_AREAS).toHaveLength(4);
  });

  it('takes no policy argument, so two colleges cannot diverge', () => {
    expect(resolveAreas()).toEqual(resolveAreas());
  });
});

describe('deriveAppraisalScore', () => {
  it('scores all Meets at 50', () => {
    expect(deriveAppraisalScore(all('meets'), AREAS)).toBe(50);
  });

  it('scores all Exceeds at 100', () => {
    expect(deriveAppraisalScore(all('exceeds'), AREAS)).toBe(100);
  });

  it('scores all Below at 0', () => {
    expect(deriveAppraisalScore(all('below'), AREAS)).toBe(0);
  });

  it('weights every area the same', () => {
    const teachingHigh: AppraisalRatingMap = {
      teaching: 'exceeds', research: 'meets', service: 'meets', collegiality: 'meets',
    };
    const serviceHigh: AppraisalRatingMap = {
      teaching: 'meets', research: 'meets', service: 'exceeds', collegiality: 'meets',
    };
    expect(deriveAppraisalScore(teachingHigh, AREAS))
      .toBe(deriveAppraisalScore(serviceHigh, AREAS));
  });

  it('returns null when any area is unrated', () => {
    const partial: AppraisalRatingMap = { teaching: 'exceeds', research: 'meets' };
    expect(deriveAppraisalScore(partial, AREAS)).toBeNull();
    expect(missingAreas(partial, AREAS)).toEqual(['service', 'collegiality']);
    expect(isComplete(partial, AREAS)).toBe(false);
  });

  it('returns 0 rather than dividing by zero on a flat scale', () => {
    const flat = { exceeds: 0, meets: 0, below: 0 };
    expect(deriveAppraisalScore(all('exceeds'), AREAS, flat)).toBe(0);
  });

  it('honours a policy point override', () => {
    const steep = resolveRatingPoints({ rating_points: { exceeds: 10, meets: 1, below: 0 } });
    expect(steep).toEqual({ exceeds: 10, meets: 1, below: 0 });
    // 3 Exceeds + 1 Meets = 31 of a possible 40.
    const mixed: AppraisalRatingMap = {
      teaching: 'exceeds', research: 'exceeds', service: 'exceeds', collegiality: 'meets',
    };
    expect(deriveAppraisalScore(mixed, AREAS, steep)).toBe(77.5);
  });

  it('falls back to defaults for a partial override', () => {
    expect(resolveRatingPoints({ rating_points: { exceeds: 5 } }))
      .toEqual({ exceeds: 5, meets: DEFAULT_RATING_POINTS.meets, below: DEFAULT_RATING_POINTS.below });
    expect(resolveRatingPoints(null)).toEqual(DEFAULT_RATING_POINTS);
  });
});

describe('parseRatings', () => {
  it('reads a well-formed payload', () => {
    const p = { ratings: { teaching: 'exceeds', research: 'below' } };
    expect(parseRatings(p, AREAS)).toEqual({ teaching: 'exceeds', research: 'below' });
  });

  it('treats a legacy 1-10 payload as not rated, never as a rating', () => {
    const legacy = { achievements: 'x', goals_next_year: 'y', self_rating: 8 };
    const parsed = parseRatings(legacy, AREAS);
    expect(parsed).toEqual({});
    expect(deriveAppraisalScore(parsed, AREAS)).toBeNull();
  });

  it('drops values that are not one of the three bands', () => {
    const junk = { ratings: { teaching: 'outstanding', research: 7, service: null } };
    expect(parseRatings(junk, AREAS)).toEqual({});
  });

  it('survives null and malformed payloads', () => {
    expect(parseRatings(null, AREAS)).toEqual({});
    expect(parseRatings({ ratings: 'nope' }, AREAS)).toEqual({});
  });
});

describe('summaries', () => {
  it('counts the bands in plain words', () => {
    expect(summariseRatings(all('meets'), AREAS)).toBe('4 Meets');
    expect(summariseRatings({}, AREAS)).toBe('Not rated');
  });

  it('flags any Below', () => {
    expect(hasBelow(all('meets'), AREAS)).toBe(false);
    expect(hasBelow({ ...all('meets'), service: 'below' }, AREAS)).toBe(true);
  });
});

describe('collegiality safeguard', () => {
  it('is on unless a college turns it off', () => {
    expect(collegialityExampleRequired(null)).toBe(true);
    expect(collegialityExampleRequired({})).toBe(true);
    expect(collegialityExampleRequired({ collegiality_below_requires_example: false })).toBe(false);
  });

  it('demands an example only when Collegiality is Below', () => {
    expect(collegialityExampleMissing(all('meets'), '', null)).toBe(false);
    expect(collegialityExampleMissing({ ...all('meets'), teaching: 'below' }, '', null)).toBe(false);
    expect(collegialityExampleMissing({ ...all('meets'), collegiality: 'below' }, '', null)).toBe(true);
  });

  it('accepts a real example and rejects a shrug', () => {
    const below = { ...all('meets'), collegiality: 'below' } as AppraisalRatingMap;
    expect(collegialityExampleMissing(below, 'no', null)).toBe(true);
    expect(
      collegialityExampleMissing(below, 'Missed four of six departmental meetings this year.', null),
    ).toBe(false);
  });

  it('can be switched off for a college', () => {
    const below = { ...all('meets'), collegiality: 'below' } as AppraisalRatingMap;
    expect(
      collegialityExampleMissing(below, '', { collegiality_below_requires_example: false }),
    ).toBe(false);
  });

  it('reads the example back out of a payload', () => {
    expect(parseCollegialityExample({ collegiality_example: 'text' })).toBe('text');
    expect(parseCollegialityExample(null)).toBe('');
    expect(parseCollegialityExample({ collegiality_example: 5 })).toBe('');
  });
});
