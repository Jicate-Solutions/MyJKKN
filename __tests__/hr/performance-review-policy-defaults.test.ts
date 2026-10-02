// =====================================================================
// HR — what an ABSENT policy key means
// =====================================================================
// The dangerous direction is a missing value switching a rule ON. No
// existing policy row carries these keys, so every college is currently
// reading the absent case — it is the only case in production today.
//
// A mutation check showed nothing covered this: flipping a toggle's
// default from `=== true` to `!== false` broke no test while silently
// blocking every increment at every college. Hence this file.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { parseValue } from '@/lib/hr/performance-review-policy';

describe('an empty policy row', () => {
  const v = parseValue({});

  it('leaves both promotion rules OFF', () => {
    expect(v.below_blocks_increment).toBe(false);
    expect(v.exclude_collegiality_from_score).toBe(false);
  });

  it('keeps the Collegiality safeguard ON', () => {
    expect(v.collegiality_below_requires_example).toBe(true);
  });

  it('uses the points and weights that shipped', () => {
    expect(v.rating_points).toEqual({ exceeds: 2, meets: 1, below: 0 });
    expect(v.area_weights).toEqual({ teaching: 1, research: 1, service: 1, collegiality: 1 });
  });
});

describe('a partial or damaged policy row', () => {
  it('falls back per field rather than discarding the row', () => {
    const v = parseValue({ rating_points: { exceeds: 5 }, area_weights: { service: 2 } });
    expect(v.rating_points).toEqual({ exceeds: 5, meets: 1, below: 0 });
    expect(v.area_weights.service).toBe(2);
    expect(v.area_weights.teaching).toBe(1);
  });

  it('refuses a negative or non-numeric weight', () => {
    const v = parseValue({ area_weights: { teaching: -4, research: 'lots' } });
    expect(v.area_weights.teaching).toBe(1);
    expect(v.area_weights.research).toBe(1);
  });

  it('only an explicit true turns a rule on', () => {
    expect(parseValue({ below_blocks_increment: 'yes' }).below_blocks_increment).toBe(false);
    expect(parseValue({ below_blocks_increment: 1 }).below_blocks_increment).toBe(false);
    expect(parseValue({ below_blocks_increment: true }).below_blocks_increment).toBe(true);
  });

  it('only an explicit false turns the safeguard off', () => {
    expect(parseValue({ collegiality_below_requires_example: 0 })
      .collegiality_below_requires_example).toBe(true);
    expect(parseValue({ collegiality_below_requires_example: false })
      .collegiality_below_requires_example).toBe(false);
  });
});
